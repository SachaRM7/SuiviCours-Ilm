export type WeekdayCode = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

export type Professor = {
  id: string;
  nom: string;
  horaires: {
    jours: WeekdayCode[];
    heure: string | null;
    duree: number;
    horaireVariable?: boolean;
  };
  ordre: number;
};

export type ModuleStatus = "en_cours" | "termine" | "a_venir";

export type CourseModule = {
  id: string;
  professeurId: string;
  nom: string;
  slug: string;
  ordre: number;
  statut: ModuleStatus;
  dateDebut: string | null;
  compteurCours: number;
};

export type StepKey =
  | "transcription"
  | "correction"
  | "synthese"
  | "sources"
  | "fiche"
  | "image";

export type CourseStep = {
  fait: boolean;
  date: string | null;
  obsolete: boolean;
};

export type Course = {
  id: string;
  professeurId: string;
  moduleId: string;
  numero: number;
  titre: string;
  titreValide: boolean;
  date: string;
  audioUrl: string | null;
  etapes: Record<StepKey, CourseStep>;
  createdAt: string;
  updatedAt: string;
};

export type ArtifactType =
  | "transcription_corrigee"
  | "synthese"
  | "fiche"
  | "prompt_image";

export type Artifact = {
  id: string;
  type: ArtifactType;
  contenu: string;
  version: number;
  createdAt: string;
};

export type ReferenceStatus =
  | "exacte"
  | "paraphrase"
  | "allusion"
  | "introuvable";

export type CourseReference = {
  id: string;
  type: "hadith" | "verset" | "parole_savant";
  texteCours: string;
  texteExact: string;
  texteArabe: string;
  sourceIdentifiee: string;
  statutAuto: ReferenceStatus;
  choixTexte: "cours" | "exact" | null;
  choixSource: string | null;
  valide: boolean;
};

export type CourseImage = {
  id: string;
  url: string;
  promptUtilise: string;
  verification: {
    faite: boolean;
    conforme: boolean;
    defauts: string[];
  };
  ordre: number;
  createdAt: string;
};

export type LibraryDocumentType =
  | "synthese"
  | "fiche"
  | "transcription_corrigee"
  | "prompt_image";

export type LibraryDocument = {
  course: Course;
  artifact: Artifact;
  module: CourseModule;
  professor: Professor;
};

export type LibraryImage = {
  course: Course;
  image: CourseImage;
  module: CourseModule;
  professor: Professor;
};

export type VocabularyEntry = {
  id: string;
  cle: string;
  translitteration: string;
  arabe: string;
  glose: string;
  gloseAlternatives?: string[];
  tags: string[];
  occurrences: Array<{
    professeurId: string;
    moduleId: string;
    coursId: string;
    coursNumero: number;
  }>;
  premiereApparition: {
    coursId: string;
    date: string;
  };
  createdAt: string;
  updatedAt: string;
};

export type PromptStep =
  | "transcription"
  | "correction"
  | "synthese"
  | "sources"
  | "fiche"
  | "prompt_image";

export type PromptTemplate = {
  id: string;
  etape: PromptStep;
  titre: string;
  template: string;
  version: number;
  actif: boolean;
  aiProvider?: "openai" | "anthropic";
  aiModel?: string;
};

export type ModuleSlugReservation = {
  professeurId: string;
  moduleId: string;
};
