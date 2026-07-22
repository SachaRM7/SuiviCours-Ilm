# Pipeline ʿilm — les 6 prompts

Variables entre `{{ }}` : injectées automatiquement par l'app.

---

## Prompt 1 — Transcription verbatim
**Destination :** Notebook Gemini · **Entrée :** fichier audio · **Sortie :** transcription brute

```
Produis la transcription verbatim intégrale de l'enregistrement audio (cours de {{professeur}}, environ {{duree}}). Ignore les moments d'échange entre les personnes présentes autour du micro. C'est uniquement sur les paroles de l'enseignant qu'on se focalise : le verbatim est un monologue, pas d'intervenants extérieurs.

Consignes strictes :
- Transcription mot à mot, sans résumé, sans reformulation, sans omission.
- Conserve les répétitions, hésitations significatives, reprises de phrase.
- Sépare en paragraphes à chaque changement de thème ou pause naturelle.
- Pour tout terme arabe prononcé (Tawhid, Jannah, hadith, noms de savants, etc.), transcris en translittération latine ET, si tu peux l'identifier avec certitude, donne l'équivalent en écriture arabe entre parenthèses.
- Pour toute citation introduite explicitement (verset, hadith, parole de savant), encadre-la entre guillemets et indique sa source telle qu'elle est donnée (ou « source non précisée » si elle ne l'est pas).
- Si un passage est inaudible ou incertain, indique-le par [inaudible] ou [incertain : ...].
- N'ajoute aucun commentaire, aucune analyse, aucune mise en forme décorative.

Format de sortie : texte brut en français, prêt à être copié dans un fichier markdown.
```

---

## Prompt 2 — Correction
**Entrée :** transcription brute + vocabulaire connu · **Sortie :** transcription corrigée

```
Tu reçois la transcription automatique d'un cours de sciences islamiques. Elle contient des erreurs de reconnaissance vocale. Corrige-les.

VOCABULAIRE DÉJÀ RENCONTRÉ DANS CE MODULE
Ces termes ont déjà été identifiés et validés. Si la transcription contient une forme déformée de l'un d'eux, rétablis l'orthographe de référence :

{{vocabulaire}}

CE QUE TU CORRIGES
1. Termes arabes et islamiques déformés par la reconnaissance vocale (noms de savants, termes techniques, formules).
2. Homophones français erronés et mots manifestement mal reconnus, quand le sens de la phrase révèle le mot juste.
3. Citations tronquées dont la forme correcte est certaine — signale-le dans ton rapport.

CE QUE TU NE FAIS PAS
- Tu ne reformules pas. Tu ne résumes pas. Tu ne lisses pas le style oral.
- Tu ne complètes aucune source manquante et ne « corriges » aucune attribution.
- Tu ne supprimes pas les passages entre crochets [incertain : ...] : tu les conserves tels quels si le doute persiste.
- Tu ne renvoies jamais vers un tiers pour validation. N'écris jamais « à vérifier avec X », « à confirmer auprès de Y » ou toute formule équivalente. Si une information est incertaine, tu la laisses entre crochets et tu la signales dans ton rapport — c'est tout.

SORTIE — deux parties

PARTIE 1 : le texte corrigé, en markdown, sans préambule.

PARTIE 2 : après une ligne `---`, un tableau des corrections :

| Original | Corrigé | Type |
|---|---|---|
| ... | ... | terme arabe / homophone / citation |

Puis, sous le tableau, une ligne `TERMES_NOUVEAUX:` suivie des termes arabes rencontrés qui ne figuraient pas dans le vocabulaire fourni, au format `translittération | graphie arabe | glose courte`, un par ligne.
```

---

## Prompt 3 — Synthèse
**Entrée :** transcription corrigée · **Sortie :** synthèse structurée

```
RÔLE
Tu es un assistant spécialisé dans la mise en forme de cours de sciences islamiques. Tu reçois la retranscription verbatim et complète d'un cours oral dispensé par {{professeur}}. Ta mission est de transformer ce verbatim brut en une synthèse de cours structurée, fidèle et pédagogique, sans jamais trahir le fond de l'enseignement.

PRINCIPES FONDAMENTAUX
1. Fidélité doctrinale absolue. Ne modifie, n'ajoute ni ne retranche aucune position théologique, juridique ou spirituelle de l'enseignant. Tu synthétises et clarifies, tu n'interprètes pas et n'extrapoles pas. En cas d'ambiguïté, conserve la formulation la plus proche de l'original plutôt que de trancher.
2. Distinction des sources. Chaque hadith, verset coranique ou citation de savant doit être signalé. Indique la source quand elle est mentionnée dans le cours, et écris « (source non précisée dans le cours) » lorsqu'elle ne l'est pas. Ne comble jamais une source manquante par mémoire ni ne « corrige » une attribution — c'est le travail d'une étape ultérieure.
3. Termes arabes. Conserve les termes techniques arabes translittérés, suivis de leur graphie arabe entre parenthèses à leur première occurrence (ex. : Tawhīd (توحيد)). Ajoute une brève glose française si le terme est central et n'a pas été défini dans le cours.
4. Registre. Conserve le registre d'enseignement. Tu peux lisser les répétitions orales, les hésitations et les apartés logistiques, mais tu conserves les exemples, anecdotes et formules marquantes qui portent le sens pédagogique.

STRUCTURE DE SORTIE
1. Titre du cours — dégage le thème central en une formule claire.
2. En-tête — intervenant, nature du document, avertissement bref sur la vérification des sources.
3. Résumé introductif (5-8 lignes).
4. Plan / idées-clés — liste ordonnée des grands points traités.
5. Développement structuré — sections thématiques avec titres. Pour chaque section : l'argument principal condensé, les hadiths et versets signalés selon les règles ci-dessus, les anecdotes marquantes résumées sans édulcoration.
6. Points de définition — glossaire des termes arabes, OBLIGATOIREMENT au format tableau à trois colonnes :

| Terme | Graphie | Glose |
|---|---|---|

7. Hadiths et références cités — récapitulatif, OBLIGATOIREMENT au format tableau :

| Type | Texte | Source dans le cours |
|---|---|---|

(Type = hadith / verset / parole de savant)

CE QU'IL FAUT ÉVITER
- N'invente aucune référence, chaîne de transmission ou attribution.
- Ne remplace pas les propos de l'enseignant par une doctrine « standard » si sa formulation diffère.
- Ne censure pas et n'atténue pas les propos vifs ou tranchés : ils font partie de l'enseignement.
- N'ajoute pas ta propre opinion, ni de commentaire critique, ni de mise en garde théologique de ton cru.
- Ne produis pas de traduction intégrale : c'est une synthèse.

FORMAT
Français, jargon islamique maintenu, markdown propre. Longueur proportionnée à la richesse du cours. Commence directement par le titre, sans préambule.

Termine par une dernière ligne, seule et exactement au format :
TITRE_COURT: [3 à 6 mots résumant le thème, pour le classement]
```

---

## Prompt 4 — Recherche des sources
**Nouveau** · **Entrée :** synthèse · **Sortie :** tableau de références

```
Tu reçois la synthèse d'un cours de sciences islamiques. Elle contient des hadiths, versets et citations de savants dont la source n'a pas toujours été donnée en cours.

TA MISSION
Pour chaque référence citée, identifier la source exacte. Rien d'autre.

MÉTHODE
1. Isole chaque hadith, verset coranique et parole de savant présents dans la synthèse.
2. Pour chacun, cherche la référence : recueil et numéro pour un hadith, sourate et verset pour le Coran, ouvrage pour une parole de savant.
3. Attribue un statut :
   - EXACTE — tu identifies la source avec certitude, et la formulation du cours correspond au texte de la référence.
   - PARAPHRASE — tu identifies le texte-source, mais la formulation entendue en cours en diffère (sens conservé, mots différents). Donne alors les DEUX versions : celle du cours et le texte exact avec sa source.
   - ALLUSION — la formulation renvoie clairement à un texte identifiable sans le citer (le cours dit lui-même « allusion à », ou la parenté est évidente).
   - INTROUVABLE — aucune correspondance, ou attribution circulant sans chaîne de transmission.
4. Pour tout texte identifié, donne le texte arabe complet avec tashkil, et le degré d'authenticité si les recueils le précisent.

RÈGLE ABSOLUE
N'invente jamais une référence. Un statut INTROUVABLE est un résultat valable et utile. Une source fabriquée est une faute grave.

SORTIE
Un tableau, rien d'autre :

| # | Type | Texte tel que dit en cours | Texte exact de la référence | Texte arabe | Source identifiée | Statut |
|---|---|---|---|---|---|---|

Puis, sous le tableau, pour chaque référence PARAPHRASE, ALLUSION ou INTROUVABLE, un court paragraphe factuel expliquant l'écart constaté — sans jugement sur l'enseignement.
```

**Ce qui passe ensuite au prompt image :**

| Statut | Choix proposés à la validation |
|---|---|
| EXACTE | la source exacte · ne pas inclure |
| PARAPHRASE | garder la formulation du cours (sans source) · utiliser le texte exact + sa source · ne pas inclure |
| ALLUSION | `Allusion à [source]` · la source exacte · ne pas inclure |
| INTROUVABLE | ne pas inclure · saisie manuelle |

La mention « source non précisée dans le cours » n'existe que dans la synthèse, où elle décrit un fait. Elle ne descend jamais vers la fiche ni vers l'image : une référence y porte soit une source réelle, soit aucune ligne de source.

---

## Prompt 5 — Fiche de révision
**Entrée :** synthèse + sources validées · **Sortie :** fiche markdown

```
RÔLE
Tu reçois la synthèse d'un cours de sciences islamiques. Tu la condenses en une FICHE DE RÉVISION : un document court, hiérarchisé et mémorisable, destiné à réviser vite et à retenir l'essentiel — pas à relire le cours.

PRINCIPE DIRECTEUR
Objectif = mémorisation, pas exhaustivité. Tu élagues sans trahir. Une bonne fiche tient sur une page. Si tu dois choisir entre deux idées, garde celle qui structure la pensée de l'enseignant, écarte l'illustration secondaire. Aucune fidélité de longueur : fidélité de fond.

RÈGLES DE CONDENSATION
1. Thèse en une phrase. Ouvre par la thèse centrale du cours, en une seule phrase mémorisable.
2. Idées-clés numérotées. 5 à 9 points maximum, chacun en une phrase courte. C'est le squelette à retenir.
3. Formules-chocs. Conserve mot pour mot les 3 à 6 formules marquantes de l'enseignant, entre guillemets.
4. Hadiths — version courte. Pour chaque hadith central : une ligne (situation → sentence), suivie de sa source entre parenthèses telle que fournie ci-dessous. Si aucune source n'est fournie pour une citation, écris la citation seule, sans parenthèses et sans mention d'absence. Écarte les hadiths secondaires.
5. Termes-clés. 5 à 8 termes arabes maximum, translittérés + graphie arabe + glose en 3-5 mots.
6. Un piège à éviter. Si le cours oppose deux notions qu'on confond souvent, isole cette distinction dans un encadré « Ne pas confondre ».

SOURCES VALIDÉES
Utilise exclusivement ces sources, telles quelles :
{{sources_validees}}

À ÉVITER
- Aucune anecdote développée : au plus une mention d'une ligne si elle porte une idée-clé.
- Aucune digression, aucun aparté.
- N'invente aucune source. Ne complète aucune attribution manquante.
- Ne déforme aucune position en la raccourcissant : coupe, ne réécris pas le sens.

FORMAT
Français, markdown dense et aéré, tenue sur une page. Commence directement par le titre.
```

---

## Prompt 6 — Générateur de prompt image
**Entrée :** synthèse + sources validées · **Sortie :** prompt pour GPT Image 2

```
TA MISSION
Tu reçois la synthèse d'un cours de sciences islamiques et ses sources validées. Tu ne rédiges PAS une fiche : tu produis un PROMPT DE GÉNÉRATION D'IMAGE, complet et prêt à coller dans GPT Image 2, qui donnera une fiche de mémorisation A4 identique en style à la charte ci-dessous. Ta seule liberté est le CONTENU. Le STYLE est figé : tu le reproduis mot pour mot.

SOURCES VALIDÉES
{{sources_validees}}

RÈGLE ABSOLUE SUR LES MENTIONS D'INCERTITUDE
Le prompt que tu produis ne doit contenir AUCUNE mention de doute, de vérification ou d'incertitude. Sont interdits : « à vérifier », « à confirmer », « graphie arabe à vérifier », « attribution incertaine », « source non précisée », et toute formule équivalente. Ces mentions se retrouveraient imprimées sur l'image finale, ce qui n'a aucun sens.

Une seule formulation est autorisée pour une source : celle fournie dans les sources validées ci-dessus, reprise mot pour mot.

Si aucune source n'est fournie pour une citation, la ligne de source est ENTIÈREMENT OMISE du gabarit — tu ne la laisses pas vide et tu ne la remplaces par rien. La citation figure seule.

Pour le texte arabe : utilise celui fourni dans les sources validées. Si aucun texte arabe n'est disponible pour une citation, écris la translittération latine seule, sans commentaire.

RÈGLES D'EXTRACTION
1. Titre & numéro de cours. Repère le numéro et le sous-thème.
2. Thèse. Une à trois phrases, au plus près de la synthèse.
3. Ancrages (3 ou 4). Les piliers qui structurent le cours. Pour chacun : un titre court, un sous-titre italique évocateur, et un contenu narratif ou en tableau. Privilégie le tableau dès qu'il y a une séquence ou une comparaison.
4. Verbatim à mémoriser. 3 formules-chocs, mot pour mot depuis la synthèse. Jamais inventées.
5. Hadith ou verset fondateur. Le texte arabe avec tashkil, la traduction française, la source depuis les sources validées.
6. Exercice. L'exercice pratique proposé dans le cours.
7. Pied de page. Une citation courte qui résume le cours.

STRUCTURE DU PROMPT À PRODUIRE
Rends UN SEUL bloc de prompt en français, prêt à coller, respectant exactement ce gabarit (remplis les [crochets], garde tout le reste identique) :

---
Une fiche de mémorisation au format A4 portrait, conçue comme une page d'un livre d'étude islamique contemporain : sobre, hiérarchisée, élégante, parfaitement lisible. L'esprit visuel est celui d'une infographie pédagogique noble, mi-traditionnelle mi-éditoriale, qui inspire le respect et la concentration. Aucune représentation humaine, animale ou figurative. Aucun symbole religieux d'autres traditions. Pure typographie, motifs géométriques discrets, micro-icônes abstraites uniquement.

Le fond principal est un crème chaud Nūr Cream #F9F4EF avec une très légère texture papier. Les titres et accents structurels sont en Mihrab Green #18352D. Les éléments d'emphase (chiffres-clés, formules à retenir, encadrés de citation) sont en Andalus Bordeaux #6B2B36. Les filets décoratifs, ornements géométriques fins et marqueurs visuels sont en Tibyān Gold #AC8F65. Aucune autre couleur.

La typographie associe une serif éditoriale élégante pour les titres et citations (style Cormorant Garamond ou similaire) à une sans-serif sobre et lisible pour le corps de texte (style Inter ou similaire). L'arabe est rendu en Amiri ou Scheherazade New avec tashkil, à taille suffisamment grande pour être lu sans effort.

Structure de la fiche, du haut vers le bas :

1. Bandeau d'en-tête sobre, sur fond Mihrab Green, hauteur réduite : titre principal en crème « [TITRE — Cours 0X · Fiche de mémorisation] ». Sous-titre en or « [Nom de l'enseignant] · [sous-titre thématique] ». Ornements géométriques aux quatre coins du bandeau (étoiles à huit branches en filigrane).

2. Section « Thèse » sur fond crème, encadrée d'un fin filet doré, texte centré en serif italique grand corps :
« [THÈSE] »

3. Section « Les [3 ou 4] ancrages » introduite par un titre en vert profond centré, avec ornements en or de part et d'autre. [3 ou 4] blocs visuellement distincts mais homogènes, en grille équilibrée. Pour chaque ancrage : numéro dans une pastille verte, titre en gras vert profond, sous-titre en italique bordeaux, contenu en sans-serif. Contenu en tableau épuré (en-tête doré, filets fins) si la matière s'y prête, sinon en bloc narratif aéré.
   - Ancrage 1 — [Titre] / [Sous-titre italique] : [contenu]
   - Ancrage 2 — [Titre] / [Sous-titre italique] : [contenu]
   - Ancrage 3 — [Titre] / [Sous-titre italique] : [contenu]
   [- Ancrage 4 — [Titre] / [Sous-titre italique] : [contenu]]

4. Section « Verbatim à mémoriser », citations encadrées sobrement sur fond crème, séparées par de fins filets dorés, petite étoile à huit branches au début de chaque citation :
« [Formule 1] »
« [Formule 2] »
« [Formule 3] »

5. Section « [Hadith fondateur / Verset fondateur] » sur fond Mihrab Green, texte crème, encadré central, ornements en or aux extrémités :
[TEXTE ARABE AVEC TASHKIL]
Traduction : « [traduction française] »
[Source en italique discret : [source] — ligne à omettre entièrement si aucune source n'est fournie]

6. Section « L'exercice ». Titre en vert profond centré. Texte en crème :
[Consigne de l'exercice]
[Exemple en italique, si présent]
[Réponse-cadre encadrée en bordeaux, si présente]
[Ligne de clôture, si présente]

7. Pied de page, sur bandeau Mihrab Green hauteur réduite, citation en or italique centrée :
« [Citation de clôture] »

Marges généreuses entre les sections, hiérarchie typographique nette, aération maximale pour lecture mobile autant qu'imprimée. Aucune illustration figurative. Uniquement motifs géométriques fins, étoiles à huit branches en filigrane comme ornements de transition, arabesques minimalistes en or pâle dans les angles.

Format final : 2480 x 3508 pixels, A4 portrait, 300 DPI, qualité d'impression.
---

À ÉVITER
- Ne modifie AUCUN élément de style (couleurs hex, noms de polices, format, ornements). Ils sont figés.
- N'invente aucun hadith, source, texte arabe ni chiffre.
- Si un ancrage manque de matière pour un tableau, mets-le en narratif — ne fabrique pas de données.
- Ne produis rien d'autre que le prompt final : pas de commentaire avant ni après.
```

---

## Ce que l'app injecte

| Variable | Prompt | Source |
|---|---|---|
| `{{professeur}}` | 1, 3 | fiche du module |
| `{{duree}}` | 1 | saisie à la création du cours |
| `{{vocabulaire}}` | 2 | collection `vocabulaire`, filtrée sur le module |
| `{{sources_validees}}` | 5, 6 | résultat validé de l'étape 4 |

## Ce que l'app récupère automatiquement

| Marqueur | Prompt | Destination |
|---|---|---|
| `TERMES_NOUVEAUX:` | 2 | collection `vocabulaire` (dédupliquée) |
| `TITRE_COURT:` | 3 | titre du cours, nom du fichier |
| tableau de références | 4 | sous-collection `references` |
| tableau du glossaire | 3 | collection `vocabulaire` |
