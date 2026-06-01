const express = require("express");
const { authenticateUser } = require("../middleware/auth.middleware");
const {
  assertEmail,
  assertPassword,
  createAuthToken,
  createTokenHash,
  hashPassword,
  publicUser,
  verifyPassword
} = require("../services/auth.service");
const {
  createUser,
  findUserByEmail,
  updateTokenHash,
  deleteUser
} = require("../repositories/user.repository");
const { cancelSubscriptionImmediately } = require("../services/billing.service");

const router = express.Router();

router.post("/register", async (req, res) => {
  try {
    const email = assertEmail(req.body?.email);
    const password = assertPassword(req.body?.password);
    const plan = "Free";

    if (await findUserByEmail(email)) {
      return res.status(409).json({
        error: "Un compte existe deja avec cet email."
      });
    }

    const token = createAuthToken();
    const user = await createUser({
      email,
      passwordHash: hashPassword(password),
      plan,
      apiTokenHash: createTokenHash(token)
    });

    return res.status(201).json({
      token,
      user: publicUser(user)
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Inscription impossible."
    });
  }
});

router.post("/login", async (req, res) => {
  try {
    const email = assertEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const user = await findUserByEmail(email);

    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({
        error: "Email ou mot de passe incorrect."
      });
    }

    const token = createAuthToken();
    await updateTokenHash(user.id, createTokenHash(token));

    return res.json({
      token,
      user: publicUser(user)
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Connexion impossible."
    });
  }
});

router.get("/me", authenticateUser, (req, res) => {
  return res.json({
    user: publicUser(req.user)
  });
});

// Droit a l'effacement (RGPD) : annulation immediate de l'abonnement puis suppression du compte.
router.delete("/me", authenticateUser, async (req, res) => {
  try {
    await cancelSubscriptionImmediately({ user: req.user });
    deleteUser(req.user.id);

    return res.json({
      deleted: true
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Suppression du compte impossible."
    });
  }
});

module.exports = router;
