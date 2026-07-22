import {
  collection,
  getDocs,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Artifact,
  ArtifactType,
  PromptStep,
  PromptTemplate,
} from "../types/domain";
import type { CourseContext } from "./libraryRepository";

function promptFromDoc(doc: QueryDocumentSnapshot<DocumentData>): PromptTemplate {
  const data = doc.data();

  return {
    id: doc.id,
    etape: data.etape,
    titre: data.titre,
    template: data.template,
    version: data.version,
    actif: data.actif,
  };
}

export async function getActivePrompt(
  etape: PromptStep,
): Promise<PromptTemplate | null> {
  const snapshot = await getDocs(
    query(
      collection(db, "prompts"),
      where("etape", "==", etape),
      where("actif", "==", true),
    ),
  );

  return (
    snapshot.docs
      .map(promptFromDoc)
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
}

async function getVocabularyForModule(moduleId: string) {
  const snapshot = await getDocs(collection(db, "vocabulaire"));
  const tagPrefix = `#${moduleId}_C`;

  return snapshot.docs
    .map((doc) => doc.data())
    .filter((entry) =>
      Array.isArray(entry.tags)
        ? entry.tags.some((tag: string) => tag.startsWith(tagPrefix))
        : false,
    )
    .map(
      (entry) =>
        `- ${entry.translitteration} (${entry.arabe}) : ${entry.glose}`,
    )
    .join("\n");
}

async function getValidatedSources(context: CourseContext) {
  const snapshot = await getDocs(
    collection(
      db,
      "professeurs",
      context.professor.id,
      "modules",
      context.module.id,
      "cours",
      context.course.id,
      "references",
    ),
  );
  const rows = snapshot.docs
    .map((doc) => doc.data())
    .filter((reference) => reference.valide)
    .map((reference) => {
      const texte =
        reference.choixTexte === "exact"
          ? reference.texteExact
          : reference.texteCours;
      const source = reference.choixSource ?? "";
      return `| ${reference.type} | ${texte} | ${source} |`;
    });

  if (rows.length === 0) {
    return "| Type | Texte | Source validée |\n|---|---|---|\n";
  }

  return `| Type | Texte | Source validée |\n|---|---|---|\n${rows.join("\n")}`;
}

function replaceVariables(template: string, variables: Record<string, string>) {
  return Object.entries(variables).reduce(
    (current, [key, value]) => current.replaceAll(`{{${key}}}`, value),
    template,
  );
}

export async function buildPromptPayload(input: {
  context: CourseContext;
  artifacts: Artifact[];
  etape: PromptStep;
  sourceArtifactType?: ArtifactType;
}) {
  const prompt = await getActivePrompt(input.etape);

  if (!prompt) {
    throw new Error(`Prompt actif introuvable pour ${input.etape}.`);
  }

  const sourceArtifact = input.sourceArtifactType
    ? input.artifacts.find((artifact) => artifact.type === input.sourceArtifactType)
    : null;
  const variables = {
    professeur: input.context.professor.nom,
    duree: String(input.context.professor.horaires.duree),
    vocabulaire:
      (await getVocabularyForModule(input.context.module.slug)) ||
      "Aucun vocabulaire validé pour ce module.",
    sources_validees: await getValidatedSources(input.context),
  };
  const injected = replaceVariables(prompt.template, variables);

  return sourceArtifact
    ? `${injected}\n\n---\n\nCONTENU SOURCE\n\n${sourceArtifact.contenu}`
    : injected;
}
