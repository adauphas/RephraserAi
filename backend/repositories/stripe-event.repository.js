const { db } = require("../database/db");

function hasProcessedStripeEvent(eventId) {
  const event = db.prepare("SELECT id FROM stripe_events WHERE id = ?").get(eventId);
  return Boolean(event);
}

function markStripeEventProcessed(eventId, eventType) {
  db.prepare(`
    INSERT OR IGNORE INTO stripe_events (id, type)
    VALUES (?, ?)
  `).run(eventId, eventType);
}

module.exports = {
  hasProcessedStripeEvent,
  markStripeEventProcessed
};
