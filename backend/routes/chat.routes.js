const express = require("express");
const { mockAuthMiddleware } = require("../middleware/auth.middleware");
const { rewriteRateLimiter } = require("../middleware/rateLimit.middleware");
const { PLANS } = require("../config/plans");
const { incrementUsage, verifyQuota } = require("../services/quota.service");
const { chatWithOpenAI } = require("../services/openai.service");

const router = express.Router();

const PLAN_RANKS = {
  Free: 0,
  "Free+": 1,
  Premium: 2,
  "Premium+": 3,
  "Premium Pro": 4
};

// La discussion libre avec l'IA est reservee aux abonnes Premium et superieurs.
const CHAT_MINIMUM_PLAN = "Premium";

function isPlanAtLeast(planName, minimumPlan) {
  return (PLAN_RANKS[planName] ?? 0) >= (PLAN_RANKS[minimumPlan] ?? 0);
}

function publicPlan(plan) {
  return plan ? {
    name: plan.name,
    monthlyPriceEur: plan.monthlyPriceEur,
    monthlyRequests: plan.monthlyRequests,
    dailyRequests: plan.dailyRequests,
    characterLimit: plan.characterLimit
  } : null;
}

function usageFromQuota(quota) {
  return {
    currentMonth: quota.user.currentMonth,
    monthlyUsage: quota.user.monthlyUsage,
    monthlyLimit: quota.plan.monthlyRequests,
    remaining: Math.max(quota.plan.monthlyRequests - quota.user.monthlyUsage, 0),
    currentDay: quota.user.currentDay,
    dailyUsage: quota.user.dailyUsage,
    dailyLimit: quota.plan.dailyRequests,
    remainingToday: Math.max(quota.plan.dailyRequests - quota.user.dailyUsage, 0)
  };
}

router.post("/", rewriteRateLimiter, mockAuthMiddleware, async (req, res) => {
  try {
    const { message } = req.body || {};

    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({
        error: "Le message ne peut pas etre vide."
      });
    }

    const normalizedMessage = message.trim();
    const quota = await verifyQuota({
      userId: req.userId,
      text: normalizedMessage
    });

    if (!quota.allowed) {
      return res.status(quota.statusCode).json({
        error: quota.error,
        reason: quota.reason,
        plan: quota.plan?.name,
        nextPlan: publicPlan(quota.nextPlan),
        usage: quota.usage
      });
    }

    if (!isPlanAtLeast(quota.plan.name, CHAT_MINIMUM_PLAN)) {
      return res.status(403).json({
        error: "La discussion avec l'IA est reservee aux abonnes Premium, Premium+ et Premium Pro.",
        reason: "paid_feature_required",
        plan: quota.plan.name,
        nextPlan: publicPlan(PLANS[CHAT_MINIMUM_PLAN]),
        usage: usageFromQuota(quota)
      });
    }

    const answer = await chatWithOpenAI(normalizedMessage);

    await incrementUsage(quota.user);

    return res.json({
      text: answer,
      plan: quota.plan.name,
      usage: usageFromQuota(quota)
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Erreur serveur."
    });
  }
});

module.exports = router;
