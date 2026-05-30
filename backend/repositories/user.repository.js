const crypto = require("crypto");
const { db, getCurrentDay, getCurrentMonth } = require("../database/db");

function mapUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    plan: row.plan,
    monthlyUsage: row.monthly_usage,
    currentMonth: row.current_month,
    dailyUsage: row.daily_usage,
    currentDay: row.current_day,
    apiTokenHash: row.api_token_hash,
    stripeCustomerId: row.stripe_customer_id,
    subscriptionStatus: row.subscription_status,
    subscriptionCancelAt: row.subscription_cancel_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function createUser({ email, passwordHash, plan, apiTokenHash }) {
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO users (
      id,
      email,
      password_hash,
      plan,
      monthly_usage,
      current_month,
      daily_usage,
      current_day,
      api_token_hash,
      subscription_status
    ) VALUES (
      @id,
      @email,
      @passwordHash,
      @plan,
      0,
      @currentMonth,
      0,
      @currentDay,
      @apiTokenHash,
      @subscriptionStatus
    )
  `).run({
    id,
    email,
    passwordHash,
    plan,
    currentMonth: getCurrentMonth(),
    currentDay: getCurrentDay(),
    apiTokenHash,
    subscriptionStatus: plan === "Free" ? "free" : "active"
  });

  return findUserById(id);
}

function findUserById(id) {
  return mapUser(db.prepare("SELECT * FROM users WHERE id = ?").get(id));
}

function findUserByEmail(email) {
  return mapUser(db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email));
}

function findUserByTokenHash(apiTokenHash) {
  return mapUser(db.prepare("SELECT * FROM users WHERE api_token_hash = ?").get(apiTokenHash));
}

function updateTokenHash(userId, apiTokenHash) {
  db.prepare(`
    UPDATE users
    SET api_token_hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(apiTokenHash, userId);
}

function updateMonthlyUsage(userId, monthlyUsage, currentMonth) {
  db.prepare(`
    UPDATE users
    SET monthly_usage = ?, current_month = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(monthlyUsage, currentMonth, userId);
}

function updateDailyUsage(userId, dailyUsage, currentDay) {
  db.prepare(`
    UPDATE users
    SET daily_usage = ?, current_day = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(dailyUsage, currentDay, userId);
}

function incrementMonthlyUsage(userId) {
  db.prepare(`
    UPDATE users
    SET
      monthly_usage = monthly_usage + 1,
      daily_usage = daily_usage + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);

  return findUserById(userId);
}

function updatePlan(userId, plan, subscriptionStatus, stripeCustomerId = null) {
  db.prepare(`
    UPDATE users
    SET
      plan = ?,
      subscription_status = ?,
      stripe_customer_id = COALESCE(?, stripe_customer_id),
      subscription_cancel_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(plan, subscriptionStatus, stripeCustomerId, userId);

  return findUserById(userId);
}

function scheduleCancellation(userId, cancelAt) {
  db.prepare(`
    UPDATE users
    SET
      subscription_status = 'canceling',
      subscription_cancel_at = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(cancelAt, userId);

  return findUserById(userId);
}

function resumeSubscription(userId) {
  db.prepare(`
    UPDATE users
    SET
      subscription_status = 'active',
      subscription_cancel_at = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(userId);

  return findUserById(userId);
}

function deleteUser(userId) {
  return db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

module.exports = {
  createUser,
  findUserById,
  findUserByEmail,
  findUserByTokenHash,
  updateTokenHash,
  updateMonthlyUsage,
  updateDailyUsage,
  incrementMonthlyUsage,
  updatePlan,
  scheduleCancellation,
  resumeSubscription,
  deleteUser
};
