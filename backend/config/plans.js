const PLANS = {
  // Free : cout estime avec gpt-5.4-nano ~= 0,005 $, perte legere
  Free: {
    name: "Free",
    monthlyPriceEur: 0,
    stripePriceId: null,
    monthlyRequests: 90,
    dailyRequests: 3,
    characterLimit: 150
  },

  // Free+ : cout estime ~= 0,027 $, tres rentable
  "Free+": {
    name: "Free+",
    monthlyPriceEur: 0.99,
    stripePriceId: null,
    monthlyRequests: 300,
    dailyRequests: 10,
    characterLimit: 250
  },

  // Premium : cout estime ~= 0,136 $, tres rentable
  Premium: {
    name: "Premium",
    monthlyPriceEur: 4.99,
    stripePriceId: null,
    monthlyRequests: 750,
    dailyRequests: 25,
    characterLimit: 500
  },

  // Premium+ : cout estime ~= 1,63 $, rentable
  "Premium+": {
    name: "Premium+",
    monthlyPriceEur: 9.99,
    stripePriceId: null,
    monthlyRequests: 3000,
    dailyRequests: 100,
    characterLimit: 1500
  },

  // Premium Pro : cout estime ~= 9,79 $, rentable mais marge plus faible
  "Premium Pro": {
    name: "Premium Pro",
    monthlyPriceEur: 19.99,
    stripePriceId: null,
    monthlyRequests: 6000,
    dailyRequests: 200,
    characterLimit: 3000
  }
};

module.exports = {
  PLANS
};
