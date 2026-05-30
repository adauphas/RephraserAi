# Déploiement en production — Rephraser AI

Architecture cible :

```
Extension Chrome  ──HTTPS──►  Backend Node/Express (Render)  ──►  PostgreSQL (Render)
                                      ▲
                                      └── Webhooks Stripe
Site vitrine : Netlify (déjà en place)
```

Hébergeur recommandé : **Render** (service web Node + base PostgreSQL gérée, simple, sauvegardée, démarrage gratuit). Alternatives équivalentes : Railway, Fly.io.

> Note : le code backend utilise aujourd'hui SQLite. La migration du code vers PostgreSQL est la prochaine étape (à faire avant le déploiement). Le reste du guide est valable tel quel.

---

## 1. Créer la base PostgreSQL

1. Render → **New → PostgreSQL**. Région proche de tes utilisateurs, plan au choix.
2. Une fois créée, copie l'**Internal Database URL** (format `postgres://user:pass@host:5432/dbname`). Ce sera la variable `DATABASE_URL`.

## 2. Déployer le backend

1. Pousse le projet sur **GitHub** (au moins le dossier `backend/`).
2. Render → **New → Web Service** → connecte le repo.
3. Réglages :
   - **Root Directory** : `backend`
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Health Check Path** : `/health`
4. Render fournit automatiquement le port via la variable `PORT` (déjà géré par `server.js`).

## 3. Variables d'environnement (sur le service web Render)

| Variable | Valeur |
|---|---|
| `DATABASE_URL` | l'URL Postgres de l'étape 1 |
| `OPENAI_API_KEY` | ta clé OpenAI |
| `STRIPE_SECRET_KEY` | `sk_live_...` (clé **live** pour la prod) |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` (créé à l'étape 4) |
| `STRIPE_PRICE_FREE_PLUS` | l'ID de prix Stripe (mode live) |
| `STRIPE_PRICE_PREMIUM` | idem |
| `STRIPE_PRICE_PREMIUM_PLUS` | idem |
| `STRIPE_PRICE_PREMIUM_PRO` | idem |
| `APP_URL` | URL publique du backend (ex. `https://rephraser-ai-backend.onrender.com`) — sert aux redirections Stripe |
| `CORS_ALLOWED_ORIGINS` | `chrome-extension://TON_ID_EXTENSION` (+ éventuellement l'URL du site) |

> ⚠️ Ne mets jamais ces clés dans le code ni sur GitHub : uniquement dans les variables d'environnement de Render.

## 4. Webhook Stripe

1. Stripe Dashboard (mode **live**) → Developers → Webhooks → **Add endpoint**.
2. URL : `https://TON-BACKEND.onrender.com/api/billing/webhook`
3. Événement : `checkout.session.completed`
4. Copie le **Signing secret** (`whsec_...`) → variable `STRIPE_WEBHOOK_SECRET` (étape 3).

## 5. Pointer l'extension vers la prod

Une fois l'URL backend connue (ex. `https://rephraser-ai-backend.onrender.com`), remplace `http://localhost:3006` par cette URL **HTTPS** dans :

- `extension/popup.js` → `DEFAULT_BACKEND_URL` (en haut, repère « PROD : … »)
- `extension/background.js` → `DEFAULT_BACKEND_URL`
- `extension/content.js` → `DEFAULT_BACKEND_URL`

Puis dans `extension/manifest.json`, remplace les `host_permissions` localhost par ton domaine :

```json
"host_permissions": ["https://rephraser-ai-backend.onrender.com/*"]
```

Recharge l'extension, vérifie que connexion + abonnement fonctionnent, puis re-zippe pour le Chrome Web Store.

## 6. ID de l'extension et CORS

- L'`CORS_ALLOWED_ORIGINS` doit contenir `chrome-extension://<ID>`.
- En non publié, l'ID change à chaque chargement. Pour un ID stable avant publication, ajoute une clé `"key"` dans le manifest (ou récupère l'ID après la 1ʳᵉ soumission au store, puis mets à jour `CORS_ALLOWED_ORIGINS`).

## 7. Base de données : où vont les comptes

Les comptes (email, **mot de passe haché**, offre, quotas, statut d'abonnement, id client Stripe) sont stockés dans **PostgreSQL** sur Render. Render gère les sauvegardes. Aucune donnée de carte bancaire n'est stockée (Stripe s'en charge).

---

## Reste à faire côté code (je m'en occupe)

- [ ] Migrer le backend de SQLite vers PostgreSQL (`pg`, requêtes asynchrones).
- [ ] Une fois l'URL backend connue : l'intégrer dans l'extension + `host_permissions` (étape 5).
