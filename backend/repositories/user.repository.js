const crypto = require("crypto");
const { pool, getCurrentMonth, getCurrentDay } = require("../database/db");

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

async function createUser({ email, passwordHash, plan, apiTokenHash }) {
  const id = crypto.randomUUID();
  const { rows } = await pool.query(
    `INSERT INTO users (
      id, email, password_hash, plan,
      monthly_usage, current_month, daily_usage, current_day,
      api_token_hash, subscription_status
    ) VALUES ($1, $2, $3, $4, 0, $5, 0, $6, $7, $8)
    RETURNING *`,
    [id, email, passwordHash, plan, getCurrentMonth(), getCurrentDay(), apiTokenHash, plan === "Free" ? "free" : "active"]
  );

  return mapUser(rows[0]);
}

async function findUserById(id) {
  const { rows } = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
  return mapUser(rows[0]);
}

async function findUserByEmail(email) {
  const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
  return mapUser(rows[0]);
}

async function findUserByTokenHash(apiTokenHash) {
  const { rows } = await pool.query("SELECT * FROM users WHERE api_token_hash = $1", [apiTokenHash]);
  return mapUser(rows[0]);
}

async function updateTokenHash(userId, apiTokenHash) {
  await pool.query(
    "UPDATE users SET api_token_hash = $1, updated_at = now() WHERE id = $2",
    [apiTokenHash, userId]
  );
}

async function updateMonthlyUsage(userId, monthlyUsage, currentMonth) {
  await pool.query(
    "UPDATE users SET monthly_usage = $1, current_month = $2, updated_at = now() WHERE id = $3",
    [monthlyUsage, currentMonth, userId]
  );
}

async function updateDailyUsage(userId, dailyUsage, currentDay) {
  await pool.query(
    "UPDATE users SET daily_usage = $1, current_day = $2, updated_at = now() WHERE id = $3",
    [dailyUsage, currentDay, userId]
  );
}

async function incrementMonthlyUsage(userId, units = 1) {
  const safeUnits = Number.isFinite(units) && units > 0 ? Math.floor(units) : 1;
  const { rows } = await pool.query(
    `UPDATE users
     SET monthly_usage = monthly_usage + $2,
         daily_usage = daily_usage + $2,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [userId, safeUnits]
  );

  return mapUser(rows[0]);
}

async function updatePlan(userId, plan, subscriptionStatus, stripeCustomerId = null) {
  const { rows } = await pool.query(
    `UPDATE users
     SET plan = $1,
         subscription_status = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         subscription_cancel_at = NULL,
         updated_at = now()
     WHERE id = $4
     RETURNING *`,
    [plan, subscriptionStatus, stripeCustomerId, userId]
  );

  return mapUser(rows[0]);
}

async function scheduleCancellation(userId, cancelAt) {
  const { rows } = await pool.query(
    `UPDATE users
     SET subscription_status = 'canceling',
         subscription_cancel_at = $1,
         updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [cancelAt, userId]
  );

  return mapUser(rows[0]);
}

async function resumeSubscription(userId) {
  const { rows } = await pool.query(
    `UPDATE users
     SET subscription_status = 'active',
         subscription_cancel_at = NULL,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [userId]
  );

  return mapUser(rows[0]);
}

async function deleteUser(userId) {
  return pool.query("DELETE FROM users WHERE id = $1", [userId]);
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
