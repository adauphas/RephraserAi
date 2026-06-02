require("dotenv").config();

const cors = require("cors");
const express = require("express");
const { initDatabase } = require("./database/db");
const { globalRateLimiter } = require("./middleware/rateLimit.middleware");
const authRoutes = require("./routes/auth.routes");
const billingRoutes = require("./routes/billing.routes");
const rewriteRoutes = require("./routes/rewrite.routes");
const chatRoutes = require("./routes/chat.routes");
const stripeWebhookRoutes = require("./routes/stripe.webhook.routes");

const app = express();
// Render (et la plupart des hebergeurs) place l'app derriere un unique proxy qui ajoute
// l'en-tete X-Forwarded-For. On fait confiance a ce seul proxy pour que express-rate-limit
// identifie correctement les IP (corrige ERR_ERL_UNEXPECTED_X_FORWARDED_FOR).
app.set("trust proxy", 1);
const port = Number(process.env.PORT || 3006);

function getAllowedOrigins() {
  return String(process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function corsOrigin(origin, callback) {
  const allowedOrigins = getAllowedOrigins();

  if (!origin) {
    return callback(null, true);
  }

  const isChromeExtension = origin.startsWith("chrome-extension://");
  const isLocalhost = origin === `http://localhost:${port}` || origin === `http://127.0.0.1:${port}`;
  const isExplicitlyAllowed = allowedOrigins.includes(origin);

  if (isChromeExtension || isLocalhost || isExplicitlyAllowed) {
    return callback(null, true);
  }

  return callback(new Error("Origine CORS refusee."));
}

app.use(cors({ origin: corsOrigin }));
app.use("/api/billing/webhook", express.raw({ type: "application/json" }), stripeWebhookRoutes);
// La route chat accepte des images (base64) : corps plus volumineux que le reste de l'API.
// Montee avant le parseur JSON global (limite 12kb) pour ne pas etre rejetee.
app.use("/api/chat", express.json({ limit: "4mb" }), chatRoutes);
app.use(express.json({ limit: "12kb" }));

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use(globalRateLimiter);

app.use("/api/auth", authRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/rewrite", rewriteRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: "Route introuvable."
  });
});

app.use((error, req, res, next) => {
  if (error.message === "Origine CORS refusee.") {
    return res.status(403).json({
      error: "Origine CORS non autorisee."
    });
  }

  return res.status(500).json({
    error: "Erreur serveur."
  });
});

initDatabase()
  .then(() => {
    const server = app.listen(port, () => {
      console.log(`Backend Rephraser AI demarre sur le port ${port}`);
    });

    server.on("error", (error) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Le port ${port} est deja utilise. Fermez le process existant ou lancez avec un autre PORT.`);
        process.exit(1);
      }

      throw error;
    });
  })
  .catch((error) => {
    console.error("Echec de l'initialisation de la base PostgreSQL:", error.message);
    process.exit(1);
  });
