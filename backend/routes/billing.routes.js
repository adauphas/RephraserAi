const express = require("express");
const { PLANS } = require("../config/plans");
const { authenticateUser } = require("../middleware/auth.middleware");
const { publicUser } = require("../services/auth.service");
const {
  createCheckoutSession,
  cancelSubscription,
  resumeSubscription
} = require("../services/billing.service");

const router = express.Router();

router.get("/plans", (req, res) => {
  const plans = Object.values(PLANS).map((plan) => ({
    name: plan.name,
    monthlyPriceEur: plan.monthlyPriceEur,
    monthlyRequests: plan.monthlyRequests,
    dailyRequests: plan.dailyRequests,
    characterLimit: plan.characterLimit
  }));

  return res.json({ plans });
});

router.post("/checkout", authenticateUser, async (req, res) => {
  try {
    const { plan } = req.body || {};
    const session = await createCheckoutSession({
      user: req.user,
      planName: plan
    });

    return res.json({
      url: session.url
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Creation du paiement impossible."
    });
  }
});

router.post("/cancel", authenticateUser, async (req, res) => {
  try {
    const { user, effectiveDate } = await cancelSubscription({ user: req.user });

    return res.json({
      user: publicUser(user),
      effectiveDate
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Annulation impossible."
    });
  }
});

router.post("/resume", authenticateUser, async (req, res) => {
  try {
    const { user } = await resumeSubscription({ user: req.user });

    return res.json({
      user: publicUser(user)
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message || "Reprise de l'abonnement impossible."
    });
  }
});

module.exports = router;
