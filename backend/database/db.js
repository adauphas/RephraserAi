const { Pool } = require("pg");

// En prod : DATABASE_URL fournie par l'hebergeur (Render). En local : Postgres local.
const connectionString = process.env.DATABASE_URL || "postgres://localhost:5432/rephraser_ai";

// Les bases gerees (Render, etc.) exigent SSL ; en local on le desactive.
// Si une connexion interne refuse le SSL ("server does not support SSL connections"),
// mettre la variable d'environnement DATABASE_SSL=false.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
const sslDisabled = isLocal || process.env.DATABASE_SSL === "false";

const pool = new Pool({
  connectionString,
  ssl: sslDisabled ? false : { rejectUnauthorized: false }
});

pool.on("error", (error) => {
  console.error("Erreur inattendue du pool PostgreSQL:", error.message);
});

function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function getCurrentDay() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

async function migrate() {
  await pool.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query("CREATE INDEX IF NOT EXISTS idx_users_api_token_hash ON users(api_token_hash);");
  await pool.query("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);");
  // Au cas ou la table existait deja sans cette colonne (migration additive).
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at TEXT;");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function initDatabase() {
  await migrate();
  // Pas de comptes de demonstration en production : seuls les comptes reels sont crees.
}

module.exports = {
  pool,
  initDatabase,
  getCurrentMonth,
  getCurrentDay
};
