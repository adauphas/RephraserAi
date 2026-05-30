const crypto = require("crypto");

const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_SALT_LENGTH = 16;
const SCRYPT_COST = 16384;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function assertEmail(email) {
  const normalizedEmail = normalizeEmail(email);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Email invalide.");
  }

  return normalizedEmail;
}

function assertPassword(password) {
  if (typeof password !== "string" || password.length < 8) {
    throw new Error("Le mot de passe doit contenir au moins 8 caracteres.");
  }

  return password;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(PASSWORD_SALT_LENGTH).toString("hex");
  const hash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: SCRYPT_COST
  }).toString("hex");

  return `${salt}:${hash}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = String(passwordHash || "").split(":");

  if (!salt || !storedHash) {
    return false;
  }

  const candidateHash = crypto.scryptSync(password, salt, PASSWORD_KEY_LENGTH, {
    N: SCRYPT_COST
  });
  const storedHashBuffer = Buffer.from(storedHash, "hex");

  if (candidateHash.length !== storedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(candidateHash, storedHashBuffer);
}

function createAuthToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function createTokenHash(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    plan: user.plan,
    monthlyUsage: user.monthlyUsage,
    currentMonth: user.currentMonth,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionCancelAt: user.subscriptionCancelAt || null
  };
}

module.exports = {
  normalizeEmail,
  assertEmail,
  assertPassword,
  hashPassword,
  verifyPassword,
  createAuthToken,
  createTokenHash,
  publicUser
};
