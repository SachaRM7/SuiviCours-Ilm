import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

function parseEnv(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((env, line) => {
      const index = line.indexOf("=");
      if (index === -1) {
        return env;
      }

      const key = line.slice(0, index);
      const value = line.slice(index + 1).replace(/^["']|["']$/g, "");
      env[key] = value;
      return env;
    }, {});
}

async function loadEnv() {
  const raw = await readFile(resolve(root, ".env"), "utf8");
  return parseEnv(raw);
}

function parsePrompts(markdown) {
  const stepByNumber = {
    1: { etape: "transcription", version: 2 },
    2: {
      etape: "correction",
      version: 3,
      aiProvider: "openai",
      aiModel: "gpt-5.6-luna",
    },
    3: {
      etape: "synthese",
      version: 4,
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-5-20260715",
    },
    4: {
      etape: "sources",
      version: 3,
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-5-20260715",
    },
    5: {
      etape: "fiche",
      version: 2,
      aiProvider: "openai",
      aiModel: "gpt-5.6-luna",
    },
    6: {
      etape: "prompt_image",
      version: 4,
      aiProvider: "openai",
      aiModel: "gpt-5.6-luna",
    },
  };
  const prompts = [];
  const pattern = /^## Prompt (\d+) .+? ([^\n]+)\n[\s\S]*?```([\s\S]*?)```/gm;

  for (const match of markdown.matchAll(pattern)) {
    const number = Number(match[1]);
    const meta = stepByNumber[number];

    if (!meta) {
      continue;
    }

    prompts.push({
      id: meta.etape,
      etape: meta.etape,
      titre: match[2].trim(),
      template: match[3].trim(),
      version: meta.version,
      actif: true,
      aiProvider: meta.aiProvider ?? null,
      aiModel: meta.aiModel ?? null,
    });
  }

  if (prompts.length !== 6) {
    throw new Error(`Expected 6 prompts, found ${prompts.length}.`);
  }

  return prompts;
}

const professorSeeds = [
  {
    id: "hatim-al-maliki",
    nom: "Cheikh Hatim Al-Maliki",
    horaires: {
      jours: ["MO", "TH"],
      heure: "20:30",
      duree: 60,
      horaireVariable: false,
    },
    ordre: 1,
    modules: [
      {
        id: "tawhid",
        nom: "Tawhid",
        slug: "Tawhid",
        ordre: 1,
        statut: "en_cours",
        dateDebut: "2026-03-02",
        compteurCours: 14,
      },
      {
        id: "tawbah",
        nom: "Le repentir",
        slug: "Tawbah",
        ordre: 2,
        statut: "a_venir",
        dateDebut: null,
        compteurCours: 0,
      },
    ],
  },
  {
    id: "ibrahim",
    nom: "Ibrahim",
    horaires: {
      jours: ["SU"],
      heure: null,
      duree: 60,
      horaireVariable: true,
    },
    ordre: 2,
    modules: [
      {
        id: "fiqh-ibadat",
        nom: "Fiqh des actes d'adoration",
        slug: "FiqhIbadat",
        ordre: 1,
        statut: "en_cours",
        dateDebut: "2026-06-01",
        compteurCours: 3,
      },
    ],
  },
];

const sampleCourse = {
  path: "professeurs/hatim-al-maliki/modules/tawhid/cours/tawhid-14",
  data: {
    professeurId: "hatim-al-maliki",
    moduleId: "tawhid",
    numero: 14,
    titre: "Les trois degrés de l'Irjā'",
    titreValide: true,
    date: "2026-07-18T20:30:00",
    audioUrl: null,
    etapes: {
      transcription: { fait: true, date: "2026-07-18T22:14:00", obsolete: false },
      correction: { fait: true, date: "2026-07-18T22:42:00", obsolete: false },
      synthese: { fait: true, date: "2026-07-19T09:10:00", obsolete: false },
      sources: { fait: false, date: null, obsolete: false },
      fiche: { fait: true, date: "2026-07-19T10:20:00", obsolete: false },
      image: { fait: true, date: "2026-07-19T10:45:00", obsolete: false },
    },
    createdAt: "2026-07-18T22:14:00",
    updatedAt: "2026-07-19T10:45:00",
  },
};

const sampleArtifacts = [
  {
    id: "synthese",
    type: "synthese",
    version: 1,
    createdAt: "2026-07-19T09:10:00",
    contenu: `# Les trois degrés de l'Irjā'

## Résumé introductif

Le Cheikh part d'un constat : la catastrophe n'est pas que l'islām nous échappe, mais de croire le comprendre et le posséder alors qu'on ne l'a pas. De cette compréhension illusoire naît l'Irjā' : réduire la foi à ce qu'il y a dans le cœur en la déconnectant des actes.

Le cours retrace la diffusion de cette dérive en trois degrés successifs : théologique, spirituel, puis culturel.

## 1. Préalable méthodologique

Avec l'ignorant, pas de discussion possible : son ignorance tient lieu de savoir. D'où le premier élément de la science du débat : le *Taḥrīr maḥall al-nizāʿ*.

تحرير محل النزاع

> Expliquer l'évident est déjà une humiliation — pour celui qui explique comme pour celui qui demande.

## 2. Séquence historique

| Degré | Époque | Nature |
|---|---|---|
| Théologique | 2e siècle de l'hégire | Débat théorique d'une minorité de savants |
| Spirituel | À partir du 5e siècle | Conversions massives avec import d'anciens réflexes |
| Culturel | Aujourd'hui | La minimisation du péché devient la règle de base |

## Hadith fondateur

مَنْ قَالَ لَا إِلَهَ إِلَّا اللهُ خَالِصًا مِنْ قَلْبِهِ دَخَلَ الْجَنَّةَ

« Celui qui dit lā ilāha illā Allāh sincèrement de son cœur entrera au paradis. »

Source non précisée dans le cours.

## Points de définition

| Terme | Graphie | Glose |
|---|---|---|
| Irjā' | إرجاء | Foi réduite au cœur, coupée des actes |
| Al-ʿUjb | العجب | Auto-satisfaction ; branche du Shirk |
| Taḥrīr maḥall al-nizāʿ | تحرير محل النزاع | Délimiter le point de litige |
`,
  },
  {
    id: "fiche",
    type: "fiche",
    version: 1,
    createdAt: "2026-07-19T10:20:00",
    contenu: `# Irjā' : trois degrés

**Thèse.** L'Irjā' commence quand la foi est imaginée comme une réalité intérieure séparée des actes.

1. Délimiter le désaccord avant de discuter.
2. Comprendre la racine théologique.
3. Observer le glissement spirituel.
4. Identifier la forme culturelle contemporaine.
5. Ne pas confondre espoir en Allah et minimisation du péché.

> Expliquer l'évident est déjà une humiliation.

## Termes-clés

| Terme | Graphie | Glose |
|---|---|---|
| Irjā' | إرجاء | Foi séparée des actes |
| Taḥrīr | تحرير | Délimitation précise |
`,
  },
  {
    id: "transcription_corrigee",
    type: "transcription_corrigee",
    version: 1,
    createdAt: "2026-07-18T22:42:00",
    contenu: `# Transcription corrigée

Aujourd'hui on va parler d'une maladie ancienne, mais qui a pris plusieurs formes. La première chose, avant de débattre, c'est de savoir exactement sur quoi porte le désaccord.

Le Cheikh insiste ensuite sur le fait que l'Irjā' n'est pas seulement une idée abstraite. C'est une manière de parler de la foi qui finit par diminuer le poids des actes.
`,
  },
  {
    id: "prompt_image",
    type: "prompt_image",
    version: 1,
    createdAt: "2026-07-19T10:40:00",
    contenu:
      "Une fiche de mémorisation au format A4 portrait, sobre, hiérarchisée, élégante, fond Nūr Cream #F9F4EF, titres Mihrab Green #18352D, accents Tibyān Gold #AC8F65, sans représentation figurative.",
  },
];

const sampleImage = {
  id: "image-1",
  url: "",
  promptUtilise: sampleArtifacts.find((artifact) => artifact.id === "prompt_image")
    .contenu,
  verification: {
    faite: false,
    conforme: false,
    defauts: [],
  },
  ordre: 1,
  createdAt: "2026-07-19T10:45:00",
};

function firestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(firestoreValue) } };
  }

  switch (typeof value) {
    case "boolean":
      return { booleanValue: value };
    case "number":
      return Number.isInteger(value)
        ? { integerValue: String(value) }
        : { doubleValue: value };
    case "object":
      return {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [
              key,
              firestoreValue(nested),
            ]),
          ),
        },
      };
    default:
      return { stringValue: String(value) };
  }
}

function firestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, firestoreValue(value)]),
  );
}

async function signIn(env) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${env.VITE_FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: env.FIREBASE_SEED_EMAIL,
        password: env.FIREBASE_SEED_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message ?? "Firebase sign-in failed.");
  }

  return body.idToken;
}

function updateWrite(projectId, path, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: firestoreFields(data),
    },
  };
}

async function commitFirestore(env, token, writes) {
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${env.VITE_FIREBASE_PROJECT_ID}/databases/(default)/documents:commit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ writes }),
    },
  );
  const body = await response.json();

  if (!response.ok) {
    throw new Error(body.error?.message ?? "Firestore commit failed.");
  }
}

async function main() {
  const env = await loadEnv();

  if (!env.FIREBASE_SEED_EMAIL || !env.FIREBASE_SEED_PASSWORD) {
    throw new Error(
      "Set FIREBASE_SEED_EMAIL and FIREBASE_SEED_PASSWORD in .env before seeding.",
    );
  }

  const promptsMarkdown = await readFile(
    resolve(root, "prompts-pipeline-ilm.md"),
    "utf8",
  );
  const prompts = parsePrompts(promptsMarkdown);
  const token = await signIn(env);
  const writes = [];
  const seededAt = new Date().toISOString();

  for (const professor of professorSeeds) {
    const { modules, ...professorData } = professor;
    writes.push(
      updateWrite(env.VITE_FIREBASE_PROJECT_ID, `professeurs/${professor.id}`, {
        ...professorData,
        seededAt,
      }),
    );

    for (const moduleData of modules) {
      writes.push(
        updateWrite(
          env.VITE_FIREBASE_PROJECT_ID,
          `professeurs/${professor.id}/modules/${moduleData.id}`,
          { ...moduleData, seededAt },
        ),
      );
      writes.push(
        updateWrite(env.VITE_FIREBASE_PROJECT_ID, `slugs/${moduleData.slug}`, {
          professeurId: professor.id,
          moduleId: moduleData.id,
          seededAt,
        }),
      );
    }
  }

  for (const prompt of prompts) {
    writes.push(
      updateWrite(env.VITE_FIREBASE_PROJECT_ID, `prompts/${prompt.id}`, {
        ...prompt,
        seededAt,
      }),
    );
  }

  writes.push(
    updateWrite(env.VITE_FIREBASE_PROJECT_ID, sampleCourse.path, {
      ...sampleCourse.data,
      seededAt,
    }),
  );

  for (const artifact of sampleArtifacts) {
    writes.push(
      updateWrite(
        env.VITE_FIREBASE_PROJECT_ID,
        `${sampleCourse.path}/artefacts/${artifact.id}`,
        { ...artifact, seededAt },
      ),
    );
  }

  writes.push(
    updateWrite(
      env.VITE_FIREBASE_PROJECT_ID,
      `${sampleCourse.path}/images/${sampleImage.id}`,
      { ...sampleImage, seededAt },
    ),
  );

  await commitFirestore(env, token, writes);
  console.log("Seed complete: professors, modules, slugs, and prompts are ready.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
