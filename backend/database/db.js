const path = require("path");
const Database = require("better-sqlite3");
const { PLANS } = require("../config/plans");
const { hashPassword, createTokenHash } = require("../services/auth.service");

const databasePath = process.env.DATABASE_URL || path.join(__dirname, "..", "data", "app.sqlite");
const db = new Database(databasePath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      plan TEXT NOT NULL,
      monthly_usage INTEGER NOT NULL DEFAULT 0,
      current_month TEXT NOT NULL,
      daily_usage INTEGER NOT NULL DEFAULT 0,
      current_day TEXT NOT NULL DEFAULT '',
      api_token_hash TEXT NOT NULL,
      stripe_customer_id TEXT,
      subscription_status TEXT NOT NULL DEFAULT 'free',
      subscription_cancel_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_users_api_token_hash ON users(api_token_hash);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
  if (!columns.includes("daily_usage")) {
    db.prepare("ALTER TABLE users ADD COLUMN daily_usage INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!columns.includes("current_day")) {
    db.prepare("ALTER TABLE users ADD COLUMN current_day TEXT NOT NULL DEFAULT ''").run();
    db.prepare("UPDATE users SET current_day = ? WHERE current_day = ''").run(getCurrentDay());
  }
  if (!columns.includes("subscription_cancel_at")) {
    db.prepare("ALTER TABLE users ADD COLUMN subscription_cancel_at TEXT").run();
  }
}

function seedDemoUsers() {
  const existing = db.prepare("SELECT COUNT(*) AS count FROM users").get();

  if (existing.count > 0) {
    return;
  }

  const currentMonth = getCurrentMonth();
  const currentDay = getCurrentDay();
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (
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
  `);

  const users = [
    { id: "user_free", email: "free@example.com", plan: "Free", token: "demo_free_token", subscriptionStatus: "free" },
    { id: "user_free_plus", email: "free-plus@example.com", plan: "Free+", token: "demo_free_plus_token", subscriptionStatus: "active" },
    { id: "user_premium", email: "premium@example.com", plan: "Premium", token: "demo_premium_token", subscriptionStatus: "active" },
    { id: "user_premium_plus", email: "premium-plus@example.com", plan: "Premium+", token: "demo_premium_plus_token", subscriptionStatus: "active" },
    { id: "user_premium_pro", email: "premium-pro@example.com", plan: "Premium Pro", token: "demo_premium_pro_token", subscriptionStatus: "active" }
  ];

  const seed = db.transaction(() => {
    for (const user of users) {
      if (!PLANS[user.plan]) {
        throw new Error(`Plan inconnu pendant le seed: ${user.plan}`);
      }

      insertUser.run({
        id: user.id,
        email: user.email,
        passwordHash: hashPassword("password-demo"),
        plan: user.plan,
        currentMonth,
        currentDay,
        apiTokenHash: createTokenHash(user.token),
        subscriptionStatus: user.subscriptionStatus
      });
    }
  });

  seed();
}

function initDatabase() {
  migrate();
  // Pas de comptes de demonstration en production : seuls les comptes reels sont crees.
}

module.exports = {
  db,
  initDatabase,
  getCurrentMonth,
  getCurrentDay
};
