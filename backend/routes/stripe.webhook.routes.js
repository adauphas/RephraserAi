const express = require("express");
const { constructWebhookEvent, handleStripeWebhookEvent } = require("../services/billing.service");

const router = express.Router();

router.post("/", async (req, res) => {
  const signature = req.get("stripe-signature");

  try {
    const event = constructWebhookEvent({
      rawBody: req.body,
      signature
    });

    const result = await handleStripeWebhookEvent(event);

    return res.json({
      received: true,
      result
    });
  } catch (error) {
    return res.status(400).json({
      error: `Webhook Stripe refuse: ${error.message}`
    });
  }
});

module.exports = router;
