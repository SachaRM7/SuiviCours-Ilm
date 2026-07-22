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
    2: { etape: "correction", version: 3 },
    3: { etape: "synthese", version: 4 },
    4: { etape: "sources", version: 1 },
    5: { etape: "fiche", version: 2 },
    6: { etape: "prompt_image", version: 3 },
  };
  const prompts = [];
  const pattern = /## Prompt (\d+) — ([^\n]+)[\s\S]*?```([\s\S]*?)```/g;

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

  await commitFirestore(env, token, writes);
  console.log("Seed complete: professors, modules, slugs, and prompts are ready.");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
