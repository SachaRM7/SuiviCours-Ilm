# Suivi cours de ʿilm — Spécification

Application web personnelle (mono-utilisateur) pour organiser des cours de sciences islamiques : bibliothèque de documents produits à partir d'enregistrements audio, et pipeline de production assisté.

---

## 1. Le problème résolu

Deux cours par semaine avec Cheikh Hatim Al-Maliki (lundi et jeudi, 20h30–21h30), un avec Ibrahim (dimanche après Asr). Chaque cours passe par une chaîne de traitement produisant plusieurs documents markdown et une image. Aujourd'hui ces fichiers sont dispersés (dossiers, galerie photo), non numérotés de façon fiable, et les prompts de chaque étape sont à retrouver manuellement.

L'app est **d'abord une bibliothèque**, ensuite un outil de production. La priorité est de retrouver un document en trois clics ; le suivi du pipeline est secondaire.

---

## 2. Stack

- **React** + **Vite** (PWA, usage mobile prioritaire)
- **Firebase** : Firestore (données), Storage (images, audio), Auth (un seul compte)
- Pas d'appel à l'API Anthropic dans la v1 — le workflow passe par copier-coller vers Claude via l'interface web. L'architecture doit permettre d'ajouter l'automatisation plus tard sans refonte.

---

## 3. Modèle de données

### `professeurs/{id}`
```
{
  nom: "Cheikh Hatim Al-Maliki",
  horaires: {
    jours: ["MO", "TH"],        // codes RRULE
    heure: "20:30",
    duree: 60,                  // minutes
    horaireVariable: false
  },
  ordre: 1
}
```
Second document : `nom: "Ibrahim"`, `jours: ["SU"]`, `horaireVariable: true`. Pour lui, l'heure est indicative : l'app propose le dimanche soir sans heure précise et laisse le champ heure vide à remplir.

### `professeurs/{id}/modules/{id}`
```
{
  nom: "Tawhid",
  slug: "Tawhid",              // unique toutes professeurs confondus
  ordre: 1,
  statut: "en_cours",          // en_cours | termine | a_venir
  dateDebut: "2026-03-02",
  compteurCours: 14            // dernier numéro attribué
}
```
Le slug doit être unique globalement : vérifier à la création et alerter en cas de collision. L'unicité est matérialisée par une collection racine `slugs/{slug}` qui référence `{ professeurId, moduleId }`. La vérification se fait par lecture directe de ce document, pas par collection group query.

### `professeurs/{p}/modules/{m}/cours/{id}`
```
{
  numero: 15,                  // repart à 1 par module
  titre: "Les trois degrés de l'Irjā'",   // vide à la création, rempli par la synthèse
  titreValide: false,          // true une fois confirmé par l'utilisateur
  date: "2026-07-20T20:30:00",
  audioUrl: null,              // Storage, facultatif
  etapes: {
    transcription: { fait: bool, date, obsolete: bool },
    correction:    { fait: bool, date, obsolete: bool },
    synthese:      { fait: bool, date, obsolete: bool },
    sources:       { fait: bool, date, obsolete: bool },
    fiche:         { fait: bool, date, obsolete: bool },
    image:         { fait: bool, date, obsolete: bool }
  },
  createdAt, updatedAt
}
```

**Dépendances entre étapes** (ce n'est pas une séquence linéaire) :
```
transcription → correction → synthese → sources → ┬→ fiche
                                                  └→ image
```
`fiche` et `image` sont indépendantes l'une de l'autre : les deux se débloquent après `sources`, dans n'importe quel ordre, et l'une peut rester non faite.

### `.../cours/{id}/artefacts/{id}`
```
{
  type: "transcription_corrigee" | "synthese" | "fiche" | "prompt_image",
  contenu: "...",              // markdown
  version: 1,
  createdAt
}
```
La transcription brute (pré-correction) n'est **pas** conservée. Le prompt image est un artefact texte (`prompt_image`). L'image déposée va dans `images`, avec `promptUtilise` recopié depuis l'artefact. Le prompt reste consultable depuis la visionneuse.

### `.../cours/{id}/references/{id}`
Résultat de l'étape sources, après arbitrage utilisateur.
```
{
  type: "hadith" | "verset" | "parole_savant",
  texteCours: "...",           // formulation entendue en cours
  texteExact: "...",           // texte de la référence identifiée, si différent
  texteArabe: "...",
  sourceIdentifiee: "Al-Tirmidhī n°2398",
  statutAuto: "exacte" | "paraphrase" | "allusion" | "introuvable",
  choixTexte: "cours" | "exact",       // pour les paraphrases uniquement
  choixSource: "Al-Tirmidhī n°2398" | null,   // null = ne pas inclure
  valide: true
}
```

**Règle centrale :** `choixSource: null` signifie qu'aucune ligne de source ne sera imprimée. La mention « source non précisée dans le cours » n'existe que dans la synthèse (où elle décrit un fait) et ne descend jamais vers la fiche ni vers l'image.

### `.../cours/{id}/images/{id}`
```
{
  url: "...",                  // Storage
  promptUtilise: "...",        // le prompt qui l'a générée
  verification: {              // résultat du contrôle par Claude
    faite: bool,
    conforme: bool,
    defauts: ["..."]
  },
  ordre: 1,
  createdAt
}
```

### `vocabulaire/{id}` — collection racine, globale
```
{
  cle: "irja",                 // clé de déduplication
  translitteration: "Irjā'",
  arabe: "إرجاء",
  glose: "Foi réduite au cœur, coupée des actes",
  tags: ["#Tawhid_C12", "#Tawhid_C14"],
  occurrences: [{ professeurId, moduleId, coursId, coursNumero }],
  premiereApparition: { coursId, date },
  createdAt, updatedAt
}
```

**Déduplication** : `cle` = translittération en minuscules, diacritiques, apostrophes et espaces retirés. `Irjā'` / `irja'` / `Irjaa` → `irja`.

**Sur doublon** : ne pas écraser la glose existante. Ajouter l'occurrence et le tag. Si la nouvelle glose diffère, le signaler à l'utilisateur qui choisit laquelle garder.

**Format des tags** : `#{moduleSlug}_C{numero}` — généré, jamais saisi.

### `prompts/{id}` — collection racine
```
{
  etape: "transcription" | "correction" | "synthese" | "sources" | "fiche" | "prompt_image",
  titre: "...",
  template: "...",             // contient des {{variables}}
  version: 3,
  actif: true
}
```
Les six prompts sont fournis dans le fichier joint `prompts-pipeline-ilm.md`, à charger en seed.

---

## 4. Variables injectées dans les prompts

| Variable | Prompts | Source |
|---|---|---|
| `{{professeur}}` | 1, 3 | document `professeurs` |
| `{{duree}}` | 1 | `professeurs.horaires.duree` |
| `{{vocabulaire}}` | 2 | collection `vocabulaire` filtrée sur le module courant, formatée en liste |
| `{{sources_validees}}` | 5, 6 | sous-collection `references` où `valide: true`, formatée en tableau |

## 5. Marqueurs récupérés automatiquement

| Marqueur en sortie | Prompt | Destination |
|---|---|---|
| `TERMES_NOUVEAUX:` suivi de lignes `translittération \| arabe \| glose` | 2 | `vocabulaire` (dédupliqué) |
| `TITRE_COURT:` en dernière ligne | 3 | `cours.titre`, à confirmer par l'utilisateur |
| Tableau du glossaire (section « Points de définition ») | 3 | `vocabulaire` |
| Tableau des références | 4 | `references` (avant arbitrage) |

Le parsing doit être tolérant : si un marqueur est absent, l'étape reste valide et l'utilisateur saisit manuellement.

---

## 6. Écrans

Quatre fichiers de maquettes HTML statiques sont fournis. `prototype-v4.html` contient cinq écrans (accueil, module, listes, lecture, visionneuse). Ils fixent la structure et l'identité visuelle ; les reproduire fidèlement en React.

### 6.1 Accueil — `prototype-v4.html`
Liste des modules groupés par professeur. Une carte par module : nom, slug, nombre de cours, statut.

### 6.2 Module — `prototype-v4.html`
Quatre « rayons » avec compteurs : Synthèses, Fiches de révision, Fiches images, Transcriptions (en style archive, bordure pointillée). En bas, un lien discret vers « À terminer » indiquant le nombre de cours en attente.

**C'est l'écran central de l'app.**

### 6.3 Liste de documents — `prototype-v4.html`
Pour un rayon donné : recherche plein texte, tri (récents / par numéro), liste avec numéro, titre, date.

Pour les images : grille de vignettes au ratio A4 portrait.

### 6.4 Lecture d'un document — `prototype-v4.html`
Rendu markdown avec support de l'arabe (police Amiri, `direction: rtl` sur les blocs arabes), tableaux, citations.

Sous le titre, une **barre de liens croisés** vers les autres artefacts du même cours. Les artefacts existants sont cliquables ; les manquants apparaissent en pointillés grisés et non cliquables. À droite, séparé : bouton « Copier le .md ».

### 6.5 Visionneuse d'image — `prototype-v4.html`
Plein écran sur fond sombre. Bouton de téléchargement. Le prompt ayant généré l'image est accessible mais replié (`<details>`).

*À ajouter ultérieurement : navigation par swipe entre les images d'un module.*

### 6.6 Nouveau cours — `ecran-nouveau-cours.html`
S'ouvre sur une **proposition pré-remplie** déduite de la date courante et des horaires des professeurs : enseignant, module actif, numéro suivant, date et heure du dernier créneau passé. La proposition explique son raisonnement en une ligne.

Deux actions : « C'est ça » (création immédiate) ou « Modifier » (formulaire complet).

Le titre reste vide par défaut, avec mention explicite qu'il viendra de la synthèse.

### 6.7 Traitement d'un cours — `ecran-traitement.html`
Les six étapes empilées. L'étape courante est dépliée et mise en évidence ; les étapes faites sont repliées sur un résumé ; les étapes non débloquées sont grisées et non cliquables.

Pour une étape à faire :
- un bouton principal « Copier le prompt + [le contenu source] » qui assemble template + variables + artefact d'entrée et le met dans le presse-papier
- une zone de collage pour le résultat
- un bouton d'enregistrement

Pour une étape faite : liens vers le contenu produit, et « Relancer l'étape ».

L'étape 6 (image) se décompose en trois temps : générer le prompt → déposer l'image → vérifier.

### 6.8 Validation des sources — `ecran-validation-sources-v2.html`
Une carte par référence détectée. Chaque carte affiche : le texte tel que dit en cours, le texte exact si différent, la source identifiée, et un encart expliquant l'écart le cas échéant.

Les options proposées dépendent du statut détecté :

| Statut | Options |
|---|---|
| Exacte | la ou les sources identifiées · Ne pas inclure · Saisir |
| Allusion | `Allusion à [source]` · la source exacte · Ne pas inclure · Saisir |
| Paraphrase | **deux étages** : (1) texte du cours ou texte exact, puis (2) options de source |
| Introuvable | Ne pas inclure (recommandé) · attribution sans chaîne · Saisir |

Un tableau de sortie en bas se remplit en direct, montrant exactement ce qui partira vers la fiche et l'image. Le bouton de validation ne se débloque qu'une fois toutes les références tranchées.

### 6.9 Vocabulaire
Liste globale, tous professeurs et modules confondus. Recherche. Chaque entrée : translittération, graphie arabe, glose, et les tags des cours d'origine. Les tags sont cliquables et mènent au cours.

Hors v1 : le modèle est créé, mais aucun écran dédié n'est construit tant que le pipeline n'alimente pas automatiquement cette collection.

### 6.10 Prompts
Liste des six prompts avec leur version. Consultation, édition, bouton copier.

Hors v1 : les six prompts sont seedés en base, mais l'écran dédié arrive avec le pipeline.

---

## 7. Règles fonctionnelles

### Régénération d'une étape
Relancer une étape ne détruit rien en aval. Ce sont les étapes en aval qui passent `obsolete: true`, pas les artefacts eux-mêmes. Par exemple, si la synthèse du cours 15 est relancée, les étapes `sources`, `fiche` et `image` deviennent obsolètes parce qu'elles ont été produites depuis une synthèse qui n'existe plus. Leurs artefacts restent accessibles et lisibles, et l'interface les signale visuellement.

L'utilisateur peut ensuite choisir explicitement de les invalider — action destructive nécessitant une confirmation.

### Numérotation
`numero` est attribué automatiquement à la création (`compteurCours + 1` du module). Modifiable manuellement si besoin. Repart à 1 pour chaque nouveau module.

### Vérification d'image (étape 6c)
L'image déposée est envoyée à Claude avec la synthèse et les références validées, pour contrôle : mentions parasites (« à vérifier », « source non précisée »), verbatim déformés, sources ne correspondant pas à celles validées, texte arabe malformé, contenu tronqué.

Sortie : conforme, ou liste de défauts. En v1 cette étape passe aussi par copier-coller.

### Export
Chaque document est exportable en `.md`. Un module entier est exportable en archive `.zip`. C'est une garantie de non-enfermement, à prévoir dès la v1.

Structure d'archive :
```
Tawhid/
  syntheses/14-les-trois-degres-de-l-irja.md
  fiches/14-les-trois-degres-de-l-irja.md
  transcriptions/14-les-trois-degres-de-l-irja.md
  images/14-les-trois-degres-de-l-irja.png
  module.json
```
Le slug du titre est en kebab-case et préfixé du numéro sur 2 chiffres. `module.json` contient les métadonnées : professeur, module, liste des cours. L'audio n'est pas inclus dans l'export.

### Audio
En v1, l'audio est seulement stocké, sans traitement. Formats acceptés : `m4a`, `mp3`, `wav`. Taille maximale : 200 Mo. Si cette partie complique le premier incrément, elle peut être repoussée en v2 sans bloquer la valeur principale.

### Auth
Vrai login Firebase Auth dès la v1, email/password, un seul compte autorisé. Les règles Firestore et Storage limitent lecture/écriture à cet UID.

### Recherche
En v1, la recherche est côté client, sur titres et contenus. Le volume prévu reste faible ; pas d'Algolia ni d'index externe.

---

## 8. Identité visuelle

Palette reprise des fiches de mémorisation produites par l'utilisateur :

| Rôle | Hex |
|---|---|
| Structure, titres, fonds sombres | `#18352D` (Mihrab Green) |
| Fond principal | `#F9F4EF` (Nūr Cream) |
| Fond secondaire, séparateurs | `#F1E9E0` |
| Accents, marqueurs, ornements | `#AC8F65` (Tibyān Gold) |
| Or clair sur fond sombre | `#D9C6A8` |
| Alerte, action requise | `#6B2B36` (Andalus Bordeaux) |
| Texte | `#2A2622` / `#6E6459` |

**Typographie** : Cormorant Garamond (titres, nombres, citations) · Inter (corps, interface) · Amiri (arabe).

Le bordeaux ne signale que ce qui attend une action de l'utilisateur. L'or ne sert qu'aux marqueurs et ornements, jamais aux fonds larges.

Rayon de bordure : 10px pour les cartes, 20px pour les boutons pilule.

---

## 9. Priorités de développement

**v1 — la bibliothèque**
Modèle de données, accueil, module, rayons, listes, lecture, visionneuse, export. Saisie manuelle des documents via textarea markdown + aperçu. Modèle `vocabulaire` et seed des six prompts, mais pas d'écran dédié. C'est déjà l'essentiel de la valeur.

**v2 — le pipeline**
Écran de traitement, prompts avec injection de variables, boutons copier, parsing des marqueurs, vocabulaire alimenté automatiquement.

**v3 — l'arbitrage**
Écran de validation des sources.

**Plus tard**
Appels directs à l'API Anthropic (correction, synthèse, sources, fiche, prompt image enchaînés sans copier-coller), swipe entre images, recherche transversale multi-modules.

---

## 10. Fichiers joints

| Fichier | Contenu |
|---|---|
| `prompts-pipeline-ilm.md` | Les six prompts, à charger en seed dans `prompts` |
| `prototype-v4.html` | Accueil, module, listes, lecture, visionneuse |
| `ecran-nouveau-cours.html` | Création d'un cours |
| `ecran-traitement.html` | Les six étapes |
| `ecran-validation-sources-v2.html` | Arbitrage des références |
