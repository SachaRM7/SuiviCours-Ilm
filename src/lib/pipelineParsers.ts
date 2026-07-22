import type { CourseReference, ReferenceStatus, VocabularyEntry } from "../types/domain";

export type ParsedVocabularyTerm = Pick<
  VocabularyEntry,
  "cle" | "translitteration" | "arabe" | "glose"
>;

export type ParsedReference = Omit<
  CourseReference,
  "id" | "choixTexte" | "choixSource" | "valide"
>;

export function vocabularyKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/['’ʿ`´\s-]/g, "")
    .toLowerCase();
}

function splitMarkdownRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorRow(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function parseMarkdownTable(markdown: string, expectedColumns: number) {
  const lines = markdown.split(/\r?\n/);
  const rows: string[][] = [];

  for (const line of lines) {
    if (!line.includes("|") || isSeparatorRow(line)) {
      continue;
    }

    const cells = splitMarkdownRow(line);
    if (cells.length >= expectedColumns) {
      rows.push(cells);
    }
  }

  return rows;
}

function looksLikeHeader(row: string[]) {
  return row.some((cell) =>
    /^(#|type|texte|source|statut|terme|graphie|glose)$/i.test(cell.trim()),
  );
}

export function parseNewTerms(markdown: string): ParsedVocabularyTerm[] {
  const marker = markdown.match(/TERMES_NOUVEAUX:\s*([\s\S]*)$/i);

  if (!marker) {
    return [];
  }

  return marker[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line.includes("|"))
    .map((line) => splitMarkdownRow(line))
    .filter((cells) => cells.length >= 3 && !looksLikeHeader(cells))
    .map(([translitteration, arabe, glose]) => ({
      cle: vocabularyKey(translitteration),
      translitteration,
      arabe,
      glose,
    }))
    .filter((term) => term.cle);
}

export function parseShortTitle(markdown: string) {
  const match = markdown.match(/^\s*TITRE_COURT:\s*(.+?)\s*$/im);
  return match?.[1]?.trim() ?? null;
}

export function parseGlossaryTerms(markdown: string): ParsedVocabularyTerm[] {
  const section =
    markdown.match(/(?:^|\n)#{1,3}\s*Points de définition\s*\n([\s\S]*?)(?:\n#{1,3}\s|\nTITRE_COURT:|$)/i)?.[1] ??
    "";

  return parseMarkdownTable(section, 3)
    .filter((row) => !looksLikeHeader(row))
    .filter((row) => row.length === 3)
    .map(([translitteration, arabe, glose]) => ({
      cle: vocabularyKey(translitteration),
      translitteration,
      arabe,
      glose,
    }))
    .filter((term) => term.cle && term.arabe && term.glose);
}

function normalizeStatus(value: string): ReferenceStatus {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (normalized.includes("paraphrase")) {
    return "paraphrase";
  }

  if (normalized.includes("allusion")) {
    return "allusion";
  }

  if (normalized.includes("introuvable")) {
    return "introuvable";
  }

  return "exacte";
}

function normalizeReferenceType(value: string): ParsedReference["type"] {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

  if (normalized.includes("verset") || normalized.includes("coran")) {
    return "verset";
  }

  if (normalized.includes("savant") || normalized.includes("citation")) {
    return "parole_savant";
  }

  return "hadith";
}

export function parseReferences(markdown: string): ParsedReference[] {
  return parseMarkdownTable(markdown, 7)
    .filter((row) => !looksLikeHeader(row))
    .map((row) => ({
      type: normalizeReferenceType(row[1] ?? ""),
      texteCours: row[2] ?? "",
      texteExact: row[3] ?? "",
      texteArabe: row[4] ?? "",
      sourceIdentifiee: row[5] ?? "",
      statutAuto: normalizeStatus(row[6] ?? ""),
    }))
    .filter((reference) => reference.texteCours || reference.texteExact);
}
