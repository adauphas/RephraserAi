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

function authenticateUser(req, res, next) {
  const bearerToken = getBearerToken(req);
  const user = bearerToken ? findUserByTokenHash(createTokenHash(bearerToken)) : null;

  if (!user) {
    return res.status(401).json({
      error: "Authentification requise."
    });
  }

  req.user = user;
  req.userId = user.id;
  return next();
}

function mockAuthMiddleware(req, res, next) {
  const bearerToken = getBearerToken(req);
  const userFromToken = bearerToken ? findUserByTokenHash(createTokenHash(bearerToken)) : null;

  if (userFromToken) {
    req.user = userFromToken;
    req.userId = userFromToken.id;
    return next();
  }

  return res.status(401).json({
    error: "Authentification requise."
  });
}

module.exports = {
  authenticateUser,
  mockAuthMiddleware
};
