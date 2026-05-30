const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3006";

const STRIPE_PRICE_IDS = {
  "Free+": process.env.STRIPE_PRICE_FREE_PLUS || "",
  Premium: process.env.STRIPE_PRICE_PREMIUM || "",
  "Premium+": process.env.STRIPE_PRICE_PREMIUM_PLUS || "",
  "Premium Pro": process.env.STRIPE_PRICE_PREMIUM_PRO || ""
};

module.exports = {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  APP_URL,
  STRIPE_PRICE_IDS
};
