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

Les prompts peuvent définir `aiProvider` et `aiModel` depuis `/prompts`.
À défaut, le pipeline utilise :

- correction : `openai` / `gpt-5.6-luna`
- synthèse : `anthropic` / `claude-sonnet-5-20260715`
- sources : `anthropic` / `claude-sonnet-5-20260715`
- fiche : `openai` / `gpt-5.6-luna`
- prompt image : `openai` / `gpt-5.6-luna`
