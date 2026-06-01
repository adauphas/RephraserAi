const { PLANS } = require("../config/plans");
const { findUserById, incrementMonthlyUsage, updateDailyUsage, updateMonthlyUsage } = require("../repositories/user.repository");

const PLAN_ORDER = ["Free", "Free+", "Premium", "Premium+", "Premium Pro"];

function getCalendarMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCalendarDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function countCharacters(text) {
  return Array.from(text).length;
}

async function ensureCurrentMonth(user) {
  const month = getCalendarMonth();

  if (user.currentMonth !== month) {
    user.currentMonth = month;
    user.monthlyUsage = 0;
    await updateMonthlyUsage(user.id, 0, month);
  }
}

async function ensureCurrentDay(user) {
  const day = getCalendarDay();

  if (user.currentDay !== day) {
    user.currentDay = day;
    user.dailyUsage = 0;
    await updateDailyUsage(user.id, 0, day);
  }
}

function getNextPlanName(planName) {
  const index = PLAN_ORDER.indexOf(planName);

  if (index === -1 || index === PLAN_ORDER.length - 1) {
    return null;
  }

  return PLAN_ORDER[index + 1];
}

async function verifyQuota({ userId, text }) {
  const user = await findUserById(userId);

  if (!user) {
    return {
      allowed: false,
      statusCode: 404,
      error: "Utilisateur introuvable."
    };
  }

  const plan = PLANS[user.plan];

  if (!plan) {
    return {
      allowed: false,
      statusCode: 403,
      error: "Offre utilisateur inconnue."
    };
  }

  await ensureCurrentMonth(user);
  await ensureCurrentDay(user);

  const characterCount = countCharacters(text);

  if (characterCount > plan.characterLimit) {
    return {
      allowed: false,
      statusCode: 413,
      error: `Texte trop long pour l'offre ${plan.name}. Limite autorisee : ${plan.characterLimit} caracteres.`
    };
  }

  if (user.monthlyUsage >= plan.monthlyRequests) {
    const nextPlanName = getNextPlanName(plan.name);

    return {
      allowed: false,
      statusCode: 429,
      reason: "monthly_quota_exceeded",
      error: `Quota mensuel depasse pour l'offre ${plan.name}. Limite : ${plan.monthlyRequests} requetes par mois.`,
      plan,
      nextPlan: nextPlanName ? PLANS[nextPlanName] : null,
      usage: {
        currentMonth: user.currentMonth,
        monthlyUsage: user.monthlyUsage,
        monthlyLimit: plan.monthlyRequests,
        remaining: 0,
        currentDay: user.currentDay,
        dailyUsage: user.dailyUsage,
        dailyLimit: plan.dailyRequests,
        remainingToday: Math.max(plan.dailyRequests - user.dailyUsage, 0)
      }
    };
  }

  if (user.dailyUsage >= plan.dailyRequests) {
    const nextPlanName = getNextPlanName(plan.name);

    return {
      allowed: false,
      statusCode: 429,
      reason: "daily_quota_exceeded",
      error: `Quota journalier depasse pour l'offre ${plan.name}. Limite : ${plan.dailyRequests} requetes par jour.`,
      plan,
      nextPlan: nextPlanName ? PLANS[nextPlanName] : null,
      usage: {
        currentMonth: user.currentMonth,
        monthlyUsage: user.monthlyUsage,
        monthlyLimit: plan.monthlyRequests,
        remaining: Math.max(plan.monthlyRequests - user.monthlyUsage, 0),
        currentDay: user.currentDay,
        dailyUsage: user.dailyUsage,
        dailyLimit: plan.dailyRequests,
        remainingToday: 0
      }
    };
  }

  return {
    allowed: true,
    user,
    plan,
    remainingRequests: plan.monthlyRequests - user.monthlyUsage,
    remainingDailyRequests: plan.dailyRequests - user.dailyUsage,
    characterCount
  };
}

async function incrementUsage(user) {
  await ensureCurrentMonth(user);
  await ensureCurrentDay(user);
  const updatedUser = await incrementMonthlyUsage(user.id);
  user.monthlyUsage = updatedUser.monthlyUsage;
  user.currentMonth = updatedUser.currentMonth;
  user.dailyUsage = updatedUser.dailyUsage;
  user.currentDay = updatedUser.currentDay;
}

module.exports = {
  verifyQuota,
  incrementUsage,
  getCalendarMonth,
  getCalendarDay,
  getNextPlanName,
  countCharacters
};
