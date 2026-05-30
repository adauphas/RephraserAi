const express = require("express");
const { mockAuthMiddleware } = require("../middleware/auth.middleware");
const { rewriteRateLimiter } = require("../middleware/rateLimit.middleware");
const { PLANS } = require("../config/plans");
const { buildPrompt, getActionLabel, isAllowedAction } = require("../services/prompt.service");
const { incrementUsage, verifyQuota } = require("../services/quota.service");
const { rewriteWithOpenAI } = require("../services/openai.service");

const router = express.Router();

const PLAN_RANKS = {
  Free: 0,
  "Free+": 1,
  Premium: 2,
  "Premium+": 3,
  "Premium Pro": 4
};

const FEATURE_MINIMUM_PLANS = {
  promptify: "Free+",
  linkedin_message: "Premium"
};

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

router.post("/", rewriteRateLimiter, mockAuthMiddleware, async (req, res) => {
  try {
    const { action, text } = req.body || {};

    if (typeof action !== "string" || !isAllowedAction(action)) {
      return res.status(400).json({
        error: "Action inconnue ou non autorisee."
      });
    }

    if (typeof text !== "string" || !text.trim()) {
      return res.status(400).json({
        error: "Le texte ne peut pas etre vide."
      });
    }

    const normalizedText = text.trim();
    const quota = verifyQuota({
      userId: req.userId,
      text: normalizedText
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

    const minimumPlan = FEATURE_MINIMUM_PLANS[action];

    if (minimumPlan && !isPlanAtLeast(quota.plan.name, minimumPlan)) {
      return res.status(403).json({
        error: minimumPlan === "Premium"
          ? "Cette option est reservee aux abonnes Premium, Premium+ et Premium Pro."
          : "Cette option est reservee aux abonnes payants.",
        reason: "paid_feature_required",
        plan: quota.plan.name,
        nextPlan: publicPlan(PLANS[minimumPlan]),
        usage: {
          currentMonth: quota.user.currentMonth,
          monthlyUsage: quota.user.monthlyUsage,
          monthlyLimit: quota.plan.monthlyRequests,
          remaining: Math.max(quota.plan.monthlyRequests - quota.user.monthlyUsage, 0),
          currentDay: quota.user.currentDay,
          dailyUsage: quota.user.dailyUsage,
          dailyLimit: quota.plan.dailyRequests,
          remainingToday: Math.max(quota.plan.dailyRequests - quota.user.dailyUsage, 0)
        }
      });
    }

    const prompt = buildPrompt(action, normalizedText);
    const rewrittenText = await rewriteWithOpenAI(prompt);

    incrementUsage(quota.user);

    return res.json({
      text: rewrittenText,
      action,
      actionLabel: getActionLabel(action),
      plan: quota.plan.name,
      usage: {
        currentMonth: quota.user.currentMonth,
        monthlyUsage: quota.user.monthlyUsage,
        monthlyLimit: quota.plan.monthlyRequests,
        remaining: Math.max(quota.plan.monthlyRequests - quota.user.monthlyUsage, 0),
        currentDay: quota.user.currentDay,
        dailyUsage: quota.user.dailyUsage,
        dailyLimit: quota.plan.dailyRequests,
        remainingToday: Math.max(quota.plan.dailyRequests - quota.user.dailyUsage, 0)
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Erreur serveur."
    });
  }
});

module.exports = router;
