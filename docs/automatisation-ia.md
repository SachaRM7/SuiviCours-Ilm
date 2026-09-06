# Automatisation IA

L'app appelle la Cloud Function `generatePipelineStep`.
Les clés API ne doivent jamais être placées dans `.env` Vite ni dans le navigateur.

## Secrets à poser

```bash
npx firebase-tools functions:secrets:set OPENAI_API_KEY
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
npx firebase-tools functions:secrets:set ALLOWED_UID
```

`ALLOWED_UID` doit contenir l'UID Firebase Auth autorisé.

## Installation et déploiement

Les fonctions tournent en Node.js 22. Le SDK `firebase-functions` reste épinglé
sur la dernière version stable disponible, même si Firebase peut signaler une
préversion plus récente.

```bash
npm run functions:install
npx firebase-tools deploy --only functions
```

Le front utilise la région `europe-west1`, identique à celle de la fonction.

## Choix des modèles

La page `/cours/:id/traitement` propose trois modèles à chaque étape
automatisable. Le tag `Recommandé` indique le modèle sélectionné par défaut,
mais il reste possible de choisir un autre modèle avant de lancer la génération.

Les prompts restent administrables depuis `/prompts` pour modifier les consignes.
Le choix effectif du modèle se fait dans la page de traitement.

Recommandations par défaut :

- correction : `openai` / `gpt-5.6-luna`
- synthèse : `anthropic` / `claude-sonnet-5-20260715`
- sources : `anthropic` / `claude-sonnet-5-20260715`
- fiche : `openai` / `gpt-5.6-luna`
- prompt image : `openai` / `gpt-5.6-luna`

Options disponibles dans l'interface :

- `GPT-5.6 Luna` : bon choix par défaut pour les étapes régulières et le coût.
- `Claude Sonnet 5` : recommandé pour les synthèses et l'analyse des sources.
- `Claude Opus 4.8` : à garder pour les cours très difficiles ou les corrections
  manuelles exigeantes.

## Deploiement automatique

Le workflow `.github/workflows/deploy.yml` construit le front et deploie
fonctions et hosting. Il se declenche a chaque push sur `main`, et
manuellement depuis l'onglet Actions de GitHub pour n'importe quelle branche.

Deux secrets GitHub sont necessaires (Settings > Secrets and variables >
Actions) :

- `ENV_FILE` : le contenu integral du fichier `.env` local, colle tel quel.
  Le workflow le reecrit avant le build, car les variables `VITE_*` sont
  injectees a la compilation.
- `FIREBASE_SERVICE_ACCOUNT` : la cle JSON d'un compte de service Google Cloud
  du projet `suivi-cours-ilm`, collee entierement.

Le compte de service doit porter les roles `Editor`, `Firebase Admin` et
`Service Account User` : le deploiement de fonctions gen2 touche Cloud
Functions, Cloud Run, Cloud Build, Artifact Registry, Cloud Tasks et Secret
Manager.

Les secrets des fonctions (`GROQ_API_KEY`, `ALLOWED_UID`, etc.) restent poses
dans Secret Manager et ne transitent pas par GitHub.
