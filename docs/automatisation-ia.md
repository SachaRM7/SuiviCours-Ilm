# Automatisation IA

L'app appelle la Cloud Function `generatePipelineStep`.
Les clés API ne doivent jamais être placées dans `.env` Vite ni dans le navigateur.

## Secrets à poser

```bash
firebase functions:secrets:set OPENAI_API_KEY
firebase functions:secrets:set ANTHROPIC_API_KEY
firebase functions:secrets:set ALLOWED_UID
```

`ALLOWED_UID` doit contenir l'UID Firebase Auth autorisé.

## Installation et déploiement

```bash
npm run functions:install
firebase deploy --only functions
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
