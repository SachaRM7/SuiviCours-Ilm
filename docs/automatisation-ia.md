# Automatisation IA

L'app appelle la Cloud Function `generatePipelineStep`.
Les clés API ne doivent jamais être placées dans `.env` Vite ni dans le navigateur.

## Secrets à poser

```bash
npx firebase-tools functions:secrets:set OPENAI_API_KEY
npx firebase-tools functions:secrets:set ANTHROPIC_API_KEY
npx firebase-tools functions:secrets:set GROQ_API_KEY
npx firebase-tools functions:secrets:set OPENCODE_API_KEY
npx firebase-tools functions:secrets:set META_API_KEY
npx firebase-tools functions:secrets:set ALLOWED_UID
```

`META_API_KEY` n'est requis que pour transcrire avec Muse Voice Transcribe ;
sans lui, Whisper reste disponible.

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

`OPENCODE_API_KEY` alimente les générations de texte via les endpoints OpenCode
Go. `GROQ_API_KEY` reste nécessaire pour la transcription Whisper.

## Choix des modèles

La page `/cours/:id/traitement` propose trois modèles à chaque étape
automatisable. Le tag `Recommandé` indique le modèle sélectionné par défaut,
mais il reste possible de choisir un autre modèle avant de lancer la génération.

Les prompts restent administrables depuis `/prompts` pour modifier les consignes.
Le choix effectif du modèle se fait dans la page de traitement.

Recommandations OpenCode Go par défaut :

- correction : `opencode` / `qwen3.8-max`
- synthèse : `opencode` / `glm-5.3`
- sources : `opencode` / `qwen3.8-max`
- fiche : `opencode` / `qwen3.8-flash`
- prompt image : `opencode` / `qwen3.8-flash`

Options disponibles dans l'interface :

- `Qwen 3.8 Max` : correction fidèle, contenu long, français et termes arabes.
- `GLM-5.3` : synthèses structurées et hiérarchisées.
- `Qwen 3.8 Flash` : fiches et prompts image plus courts et rapides.

Le serveur utilise les endpoints `/zen/go/v1/messages` et
`/zen/go/v1/chat/completions`, avec un identifiant de session stable par cours.
Les limites de sortie sont adaptées à chaque étape : 16 000 tokens pour une
correction, 8 000 pour une synthèse ou des sources, 5 000 pour une fiche et
3 000 pour un prompt image.

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


## Transcription audio

L'etape 1 propose deux modeles, au choix dans l'ecran de traitement.

| | Whisper Large V3 (Groq) | Muse Voice Transcribe (Meta) |
|---|---|---|
| Cout | Free Tier | ~0,18 $ par heure d'audio |
| Sortie | un bloc de texte | tours de parole etiquetes `Locuteur A :` |
| Vocabulaire | prompt de contexte | biais de mots-cles sur le vocabulaire du module |
| Formats déposés | m4a, mp3 ou wav | m4a, mp3 ou wav, convertis automatiquement en WAV |

Whisper reste le defaut : une requete sans `provider` continue de passer par lui.

Muse Voice Transcribe recoit en `keywords` les translitterations du vocabulaire
deja valide pour le module, ce qui fixe les termes arabes des la transcription
au lieu de les rattraper a l'etape de correction. La diarisation etiquette les
locuteurs, ce que le prompt 1 reclame en demandant d'ignorer les echanges avec
la salle. Le serveur convertit chaque depot en WAV mono PCM 24 kHz et le decoupe
en segments de moins de 10 minutes, conformement aux limites de l'API Meta.

Le francais et l'arabe font partie des langues prises en charge. Ils sont tous
les deux fournis a `languageBias` pour mieux gerer les changements de langue.
