const Stripe = require("stripe");
const { PLANS } = require("../config/plans");
const { APP_URL, STRIPE_PRICE_IDS, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } = require("../config/stripe");
const { hasProcessedStripeEvent, markStripeEventProcessed } = require("../repositories/stripe-event.repository");
const {
  findUserById,
  updatePlan,
  scheduleCancellation,
  resumeSubscription: resumeSubscriptionRecord
} = require("../repositories/user.repository");

function getStripeClient() {
  if (!STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY manquante cote backend.");
  }

  return new Stripe(STRIPE_SECRET_KEY);
}

function getPaidPlan(planName) {
  const plan = PLANS[planName];

  if (!plan || plan.monthlyPriceEur <= 0) {
    throw new Error("Offre payante inconnue.");
  }

  const priceId = STRIPE_PRICE_IDS[planName];

  if (!priceId) {
    throw new Error(`Price ID Stripe manquant pour l'offre ${planName}.`);
  }

  return {
    plan,
    priceId
  };
}

function getPlanNameFromPriceId(priceId) {
  return Object.entries(STRIPE_PRICE_IDS).find((entry) => entry[1] === priceId)?.[0] || null;
}

async function createCheckoutSession({ user, planName }) {
  const stripe = getStripeClient();
  const { priceId } = getPaidPlan(planName);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: user.email,
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    client_reference_id: user.id,
    metadata: {
      userId: user.id,
      plan: planName
    },
    success_url: `${APP_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_URL}/billing/cancel`
  });
}

function isPaidUser(user) {
  const plan = PLANS[user.plan];
  return Boolean(plan && plan.monthlyPriceEur > 0);
}

// Date de fin de la periode de facturation en cours.
// En mode demo (sans abonnement Stripe), on calcule le prochain anniversaire
// mensuel de la souscription (date d'inscription) afin d'obtenir une date d'effet realiste.
function computeDemoPeriodEnd(user) {
  const anchor = user.createdAt ? new Date(user.createdAt) : new Date();
  const now = new Date();
  const periodEnd = new Date(anchor.getTime());

  while (periodEnd.getTime() <= now.getTime()) {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }

  return periodEnd;
}

async function findActiveStripeSubscription(stripe, customerId) {
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10
  });

  return subscriptions.data.find((sub) => sub.status === "active" || sub.status === "trialing") || null;
}

// Annulation a la fin de la periode payee : l'acces reste actif jusqu'a la date d'effet.
async function cancelSubscription({ user }) {
  if (!isPaidUser(user)) {
    throw new Error("Aucun abonnement payant a annuler.");
  }

  if (user.subscriptionStatus === "canceling" && user.subscriptionCancelAt) {
    return {
      user,
      effectiveDate: user.subscriptionCancelAt
    };
  }

  let effectiveDate;

  if (STRIPE_SECRET_KEY && user.stripeCustomerId) {
    const stripe = getStripeClient();
    const subscription = await findActiveStripeSubscription(stripe, user.stripeCustomerId);

    if (!subscription) {
      throw new Error("Abonnement Stripe introuvable pour ce compte.");
    }

    const updated = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true
    });

    effectiveDate = new Date(updated.current_period_end * 1000).toISOString();
  } else {
    effectiveDate = computeDemoPeriodEnd(user).toISOString();
  }

  const updatedUser = await scheduleCancellation(user.id, effectiveDate);

  return {
    user: updatedUser,
    effectiveDate
  };
}

// Reprise d'un abonnement programme pour annulation, avant la date d'effet.
async function resumeSubscription({ user }) {
  if (user.subscriptionStatus !== "canceling") {
    return { user };
  }

  if (STRIPE_SECRET_KEY && user.stripeCustomerId) {
    const stripe = getStripeClient();
    const subscription = await findActiveStripeSubscription(stripe, user.stripeCustomerId);

    if (subscription) {
      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: false
      });
    }
  }

  const updatedUser = await resumeSubscriptionRecord(user.id);
  return { user: updatedUser };
}

// Annulation immediate (RGPD / suppression de compte) : resiliation sans attendre la fin de periode.
async function cancelSubscriptionImmediately({ user }) {
  if (STRIPE_SECRET_KEY && user.stripeCustomerId) {
    const stripe = getStripeClient();
    const subscription = await findActiveStripeSubscription(stripe, user.stripeCustomerId);

    if (subscription) {
      await stripe.subscriptions.cancel(subscription.id);
    }
  }
}

function constructWebhookEvent({ rawBody, signature }) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET manquant cote backend.");
  }

  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
}

async function handleCheckoutSessionCompleted(session) {
  const userId = session.metadata?.userId || session.client_reference_id;
  const requestedPlan = session.metadata?.plan;

  if (!userId) {
    throw new Error("Session Stripe sans userId.");
  }

  const user = await findUserById(userId);

  if (!user) {
    throw new Error("Utilisateur introuvable pour cette session Stripe.");
  }

  let planName = requestedPlan;

  if (!PLANS[planName]) {
    const stripe = getStripeClient();
    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, { limit: 1 });
    const priceId = lineItems.data[0]?.price?.id;
    planName = getPlanNameFromPriceId(priceId);
  }

  if (!PLANS[planName] || PLANS[planName].monthlyPriceEur <= 0) {
    throw new Error("Plan Stripe invalide.");
  }

  return updatePlan(user.id, planName, "active", session.customer || null);
}

async function handleStripeWebhookEvent(event) {
  if (await hasProcessedStripeEvent(event.id)) {
    return {
      ignored: true,
      reason: "already_processed"
    };
  }

  if (event.type === "checkout.session.completed") {
    const user = await handleCheckoutSessionCompleted(event.data.object);
    await markStripeEventProcessed(event.id, event.type);
    return {
      handled: true,
      user
    };
  }

  await markStripeEventProcessed(event.id, event.type);
  return {
    ignored: true,
    reason: "unhandled_event_type"
  };
}

module.exports = {
  constructWebhookEvent,
  createCheckoutSession,
  cancelSubscription,
  resumeSubscription,
  cancelSubscriptionImmediately,
  handleStripeWebhookEvent
};
