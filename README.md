# Rephraser AI

Extension Chrome Manifest V3 avec backend Node.js/Express pour rewrite, correct, translate and polish selected text instantly. La cle OpenAI reste uniquement cote backend, et le backend force le modele `gpt-5.4-nano`.

## Structure

```text
chrome-ai-rewriter-extension/
├── extension/
└── backend/
```

## Installer l'extension Chrome

1. Ouvrir Chrome puis aller sur `chrome://extensions`.
2. Activer le mode developpeur.
3. Cliquer sur `Charger l'extension non empaquetee`.
4. Selectionner le dossier `extension`.
5. Epingler l'extension si besoin, puis ouvrir son panneau pour verifier l'URL backend.

## Installer le backend

```bash
cd backend
npm install
cp .env.example .env
```

Dans `.env`, renseigner :

```bash
OPENAI_API_KEY=sk-your-key-here
PORT=3006
DATABASE_URL=./data/app.sqlite
CORS_ALLOWED_ORIGINS=chrome-extension://YOUR_EXTENSION_ID,http://localhost:3006,http://127.0.0.1:3006
APP_URL=http://localhost:3006
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
STRIPE_PRICE_FREE_PLUS=price_your_free_plus_monthly
STRIPE_PRICE_PREMIUM=price_your_premium_monthly
STRIPE_PRICE_PREMIUM_PLUS=price_your_premium_plus_monthly
STRIPE_PRICE_PREMIUM_PRO=price_your_premium_pro_monthly
```

L'identifiant Chrome se trouve dans `chrome://extensions` une fois l'extension chargee.

## Lancer le backend

```bash
npm start
```

Le projet utilise maintenant le port `3006` par defaut pour eviter les conflits avec d'autres outils locaux. Si le port `3006` est deja utilise :

```bash
PORT=3007 npm start
```

Dans ce cas, ouvrir le panneau de l'extension et remplacer l'URL backend par `http://localhost:3007`.

Endpoint principal :

```http
POST http://localhost:3006/api/rewrite
Content-Type: application/json
Authorization: Bearer demo_free_token

{
  "userId": "user_free",
  "action": "professionalize",
  "text": "texte selectionne"
}
```

## Authentification

Le backend utilise SQLite (`backend/data/app.sqlite`) et des tokens Bearer hashes en base. Le popup de l'extension permet maintenant de creer un compte ou de se connecter.

Endpoints :

```http
POST /api/auth/register
POST /api/auth/login
GET /api/auth/me
```

Body register/login :

```json
{
  "email": "vous@example.com",
  "password": "motdepasse"
}
```

Les comptes demo restent disponibles apres le seed SQLite :

| User | Token demo |
| --- | --- |
| `user_free` | `demo_free_token` |
| `user_free_plus` | `demo_free_plus_token` |
| `user_premium` | `demo_premium_token` |
| `user_premium_plus` | `demo_premium_plus_token` |
| `user_premium_pro` | `demo_premium_pro_token` |

## Tester l'extension

1. Lancer le backend.
2. Ouvrir une page web classique.
3. Selectionner du texte.
4. Clic droit, puis `Rephraser AI`.
5. Choisir une action.
6. La modale affiche `Chargement...`, puis le resultat ou une erreur claire.
7. Utiliser `Copier` ou `Remplacer la selection` quand le remplacement est techniquement possible.

## Actions disponibles

- Corriger
- Professionnaliser
- Casual
- Formel
- Simple corrections
- Raccourcir
- Enrichir
- Repondre a cette selection
- Message LinkedIn (reserve aux offres Premium, Premium+ et Premium Pro)
- Transformer en prompt IA (reserve aux offres payantes)
- Traduire en anglais
- Traduire en espagnol
- Traduire en francais
- Traduire en allemand
- Traduire en portugais

## Langues de l'extension

L'extension utilise le systeme `chrome.i18n` et suit automatiquement la langue de Chrome quand une traduction est disponible. Les langues incluses sont :

- Francais (`fr`) par defaut
- Anglais (`en`)
- Allemand (`de`)
- Espagnol (`es`)
- Portugais (`pt`)

Les abonnes payants peuvent aussi choisir manuellement la langue de l'interface depuis le popup. Les utilisateurs gratuits restent sur la langue Chrome automatique.

## Fonctions premium

- Transformation d'une selection en prompt IA.
- Transformation d'une selection en message LinkedIn pour Premium, Premium+ et Premium Pro.
- Choix manuel de la langue de l'interface.
- Champ de redaction directement dans l'extension a partir de Premium.
- Historique des 5 dernieres requetes avec copie rapide a partir de Premium.

## Offres et quotas

Les offres sont definies cote backend dans `backend/config/plans.js`. Les Price IDs Stripe sont lus depuis `.env`.

| Offre | Prix mensuel | Usage max/mois | Limite/jour | Limite caracteres |
| --- | ---: | ---: | ---: | ---: |
| Free | 0 EUR | 90 requetes / mois | 3 requetes / jour | 150 |
| Free+ | 0,99 EUR | 300 requetes / mois | 10 requetes / jour | 250 |
| Premium | 4,99 EUR | 750 requetes / mois | 25 requetes / jour | 500 |
| Premium+ | 9,99 EUR | 3000 requetes / mois | 100 requetes / jour | 1500 |
| Premium Pro | 19,99 EUR | 6000 requetes / mois | 200 requetes / jour | 3000 |

La limite mensuelle est calculee par mois calendaire au format `YYYY-MM`. Une limite journaliere est aussi appliquee : par exemple, `90 requetes / mois` pour l'offre Free signifie `3 requetes / jour`. Si le texte depasse la limite de caracteres, si le quota journalier est atteint, ou si le quota mensuel est atteint, le backend retourne une erreur avant tout appel OpenAI.

## Securite

- La cle API OpenAI est lue depuis `process.env.OPENAI_API_KEY`.
- Aucun fichier de l'extension ne contient la cle API.
- Le backend est le seul endroit qui appelle OpenAI.
- Le modele est fixe cote backend via `const MODEL = "gpt-5.4-nano";`.
- Aucun parametre client ne permet de changer le modele.
- Les actions sont validees avec une liste blanche.
- Les textes vides, trop longs ou les actions inconnues sont refuses.
- Le plan utilisateur vient du backend, pas du client.
- `express-rate-limit` limite les abus.
- CORS accepte les origines Chrome Extension et les origines locales de developpement.

## Utilisateurs mockes

Les utilisateurs de test sont seedes dans SQLite au premier lancement. Le panneau de l'extension permet de choisir un utilisateur demo ou de se connecter avec un vrai compte local.

## Stripe

La preparation Stripe expose :

```http
GET /api/billing/plans
POST /api/billing/checkout
Authorization: Bearer <token>
POST /api/billing/webhook
```

`POST /api/billing/checkout` attend :

```json
{
  "plan": "Premium"
}
```

Le backend retourne une URL Stripe Checkout quand `STRIPE_SECRET_KEY` et le `STRIPE_PRICE_*` correspondant sont configures.

Le webhook Stripe ecoute `checkout.session.completed`. Quand Stripe confirme le paiement, le backend lit `metadata.userId` et `metadata.plan`, puis met automatiquement a jour le plan utilisateur en base.

En local, utiliser Stripe CLI :

```bash
stripe listen --events checkout.session.completed --forward-to localhost:3006/api/billing/webhook
```

Copier le `whsec_...` affiche par Stripe CLI dans `.env` :

```bash
STRIPE_WEBHOOK_SECRET=whsec_...
```

Dans le Dashboard Stripe en production, creer un endpoint webhook vers :

```text
https://votre-domaine.com/api/billing/webhook
```

Selectionner au minimum l'evenement :

```text
checkout.session.completed
```

## Prochaines etapes recommandees

- Remplacer SQLite par PostgreSQL.
- Ajouter le webhook Stripe pour activer automatiquement les plans apres paiement.
- Ajouter un dashboard utilisateur.
- Ajouter des analytics d'usage.
- Ajouter un systeme anti-abus plus avance.
