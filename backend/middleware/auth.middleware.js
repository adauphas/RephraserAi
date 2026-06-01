const { createTokenHash } = require("../services/auth.service");
const { findUserByTokenHash } = require("../repositories/user.repository");

function getBearerToken(req) {
  const authorization = req.get("Authorization") || "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token) {
    return token;
  }

  return null;
}

async function authenticateUser(req, res, next) {
  try {
    const bearerToken = getBearerToken(req);
    const user = bearerToken ? await findUserByTokenHash(createTokenHash(bearerToken)) : null;

    if (!user) {
      return res.status(401).json({
        error: "Authentification requise."
      });
    }

    req.user = user;
    req.userId = user.id;
    return next();
  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur." });
  }
}

async function mockAuthMiddleware(req, res, next) {
  try {
    const bearerToken = getBearerToken(req);
    const userFromToken = bearerToken ? await findUserByTokenHash(createTokenHash(bearerToken)) : null;

    if (userFromToken) {
      req.user = userFromToken;
      req.userId = userFromToken.id;
      return next();
    }

    return res.status(401).json({
      error: "Authentification requise."
    });
  } catch (error) {
    return res.status(500).json({ error: "Erreur serveur." });
  }
}

module.exports = {
  authenticateUser,
  mockAuthMiddleware
};
