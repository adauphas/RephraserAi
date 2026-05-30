# Rapport de tests — Extension Rephraser AI

Date : 29 mai 2026 · Version extension : 1.2.5 · Backend : 1.1.0

## Synthèse

| Domaine | Résultat |
|---|---|
| Syntaxe `popup.js` (1142 lignes) | ✅ Validée (`node --check`) |
| `manifest.json` (MV3) | ✅ Valide |
| Couverture i18n (5 langues) | ✅ 162 clés utilisées, toutes présentes dans fr/en/de/es/pt |
| Cohérence des catalogues | ✅ 169 clés identiques par langue |
| Cross-référence DOM (popup.js ↔ popup.html) | ✅ 47/47 éléments résolus |
| Logique métier (offres, annulation, profil) | ✅ 12/12 |
| Logique backend (cancel/resume/RGPD) | ✅ 9/9 |
| Intégration HTTP backend | ⏳ Script fourni à exécuter en local |

**Avis : GO pour la prod**, sous réserve des deux vérifications manuelles ci-dessous (intégration backend + smoke test Chrome).

## Détail des tests automatiques

### 1. Syntaxe et manifest
- `popup.js` : analyse syntaxique complète réussie sur le fichier intégral.
- `manifest.json` : Manifest V3, version 1.2.5, `default_locale` fr, permissions (`contextMenus`, `activeTab`, `scripting`, `storage`), `host_permissions` localhost/127.0.0.1 (cohérent avec le backend 3006), icônes et scripts référencés existants.

### 2. Internationalisation (le point sensible récent)
- 162 clés distinctes réellement utilisées (extraites de `popup.js`, `popup.html`, `background.js`, `content.js`, et des tableaux `PLAN_OPTION_KEYS` / `ACTION_LABEL_KEYS`).
- Chacune est présente dans les **5** fichiers de langue (vérification par lot : 82/82 puis 80/80, identiques partout).
- 169 clés au total par langue, comptage identique → aucun trou.
- Confirme que le bug précédent (textes restés en français en mode anglais) venait bien du **non re-rendu** lors du changement de langue (corrigé en 1.2.5), pas d'un manque de traductions.

### 3. Cross-référence DOM
- Les 47 `getElementById(...)` de `popup.js` correspondent tous à un `id` présent dans `popup.html` → aucun risque de `null` au chargement (notamment après la refonte du profil et le retrait du bouton « Actualiser »).

### 4. Logique métier (12/12)
- Filtrage des offres : Premium+ → {Premium+, Premium Pro} ; Pro → {Pro} ; démo Premium+ idem ; Free/anonyme → 4 offres. Aucune offre inférieure proposée.
- Annulation : date d'effet calculée dans le futur et < 1 mois (prochain anniversaire mensuel).
- Profil : libellés de statut (Actif / Annulation programmée / Gratuit), consommation 600/3000 = 20 %, plafonnement à 100 %, 0 %.
- Cas limites : liste d'offres vide et statut inconnu gérés sans erreur.

### 5. Logique backend (9/9)
- Annulation : date d'effet + statut `canceling` + appel unique ; refus sur compte Free ; idempotence si déjà annulé.
- Reprise : repasse `active` et efface la date ; no-op si non annulé.
- Suppression RGPD : annulation immédiate puis suppression, y compris pour un compte sans abonnement.

## À vérifier manuellement avant la mise en production

### A. Intégration backend (5 min)
```bash
cd backend && npm start          # démarre sur http://localhost:3006
# dans un autre terminal :
bash backend/test-integration.sh
```
Le script teste health, inscription, connexion, /me, offres, refus d'annulation Free, suppression RGPD et le 401 post-suppression. Il indique aussi comment tester cancel/resume sur un compte de démo payant.

### B. Smoke test dans Chrome (ce que l'automatisation ne couvre pas)
1. Charger l'extension décompressée (`chrome://extensions` → Charger l'extension non empaquetée → dossier `extension`).
2. Inscription/connexion : les champs disparaissent, « Profil » apparaît, Entrée connecte.
3. Profil : infos compte, consommation, annuler → date affichée, reprendre, suppression avec confirmation.
4. Changement de langue (compte payant) : tout l'écran bascule, y compris les cartes d'offres.
5. Section Abonnement repliable ; offres inférieures masquées selon l'offre.
6. Menu contextuel (clic droit sur une sélection) et génération de texte.
7. Paiement Stripe réel (checkout) — non testable hors environnement Stripe configuré.

## Notes mineures (non bloquantes)
- `site/terms.html` et `site/privacy.html` décrivent encore le bouton comme « Supprimer mes données (RGPD) » dans la « section Compte ». Dans l'extension il s'appelle désormais « Supprimer mes données » et se trouve dans « Profil ». Le zip Netlify livré contient déjà le texte corrigé ; il reste à aligner les fichiers source du site si tu régénères le zip toi-même.
- Le test d'intégration HTTP n'a pas pu être exécuté dans l'environnement de test (système de fichiers non synchronisé) ; il est fourni en script pour ton environnement réel.
