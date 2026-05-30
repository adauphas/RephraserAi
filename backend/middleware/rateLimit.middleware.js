const rateLimit = require("express-rate-limit");

const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Trop de requetes. Reessayez dans quelques minutes."
  }
});

const rewriteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Trop de reformulations en peu de temps. Reessayez dans une minute."
  }
});

module.exports = {
  globalRateLimiter,
  rewriteRateLimiter
};
