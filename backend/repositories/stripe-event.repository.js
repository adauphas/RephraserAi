const { pool } = require("../database/db");

async function hasProcessedStripeEvent(eventId) {
  const { rows } = await pool.query("SELECT id FROM stripe_events WHERE id = $1", [eventId]);
  return rows.length > 0;
}

async function markStripeEventProcessed(eventId, eventType) {
  await pool.query(
    "INSERT INTO stripe_events (id, type) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING",
    [eventId, eventType]
  );
}

module.exports = {
  hasProcessedStripeEvent,
  markStripeEventProcessed
};
