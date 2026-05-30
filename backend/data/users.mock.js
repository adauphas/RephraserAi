function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

const currentMonth = getCurrentMonth();

const users = [
  {
    id: "user_free",
    email: "free@example.com",
    plan: "Free",
    authProviderId: null,
    stripeCustomerId: null,
    subscriptionStatus: "free",
    monthlyUsage: 0,
    currentMonth
  },
  {
    id: "user_free_plus",
    email: "free-plus@example.com",
    plan: "Free+",
    authProviderId: null,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    monthlyUsage: 0,
    currentMonth
  },
  {
    id: "user_premium",
    email: "premium@example.com",
    plan: "Premium",
    authProviderId: null,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    monthlyUsage: 0,
    currentMonth
  },
  {
    id: "user_premium_plus",
    email: "premium-plus@example.com",
    plan: "Premium+",
    authProviderId: null,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    monthlyUsage: 0,
    currentMonth
  },
  {
    id: "user_premium_pro",
    email: "premium-pro@example.com",
    plan: "Premium Pro",
    authProviderId: null,
    stripeCustomerId: null,
    subscriptionStatus: "active",
    monthlyUsage: 0,
    currentMonth
  }
];

function findUserById(userId) {
  return users.find((user) => user.id === userId);
}

module.exports = {
  users,
  findUserById
};
