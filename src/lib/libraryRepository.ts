import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db } from "./firebase";
import { storage } from "./firebase";
import type {
  Artifact,
  ArtifactType,
  Course,
  CourseImage,
  CourseModule,
  CourseReference,
  LibraryDocument,
  LibraryImage,
  Professor,
  StepKey,
} from "../types/domain";
import type { ParsedReference, ParsedVocabularyTerm } from "./pipelineParsers";

export type ProfessorWithModules = Professor & {
  modules: CourseModule[];
};

export type CourseContext = {
  professor: Professor;
  module: CourseModule;
  course: Course;
};

export type ModuleExportData = {
  professor: Professor;
  module: CourseModule;
  courses: Array<{
    course: Course;
    artifacts: Artifact[];
    images: CourseImage[];
  }>;
};

const acceptedAudioTypes = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
]);
const acceptedAudioExtensions = /\.(m4a|mp3|wav)$/i;
const maxAudioSize = 200 * 1024 * 1024;

function professorFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Professor {
  const data = doc.data();

  return {
    id: doc.id,
    nom: data.nom,
    horaires: data.horaires,
    ordre: data.ordre,
  };
}

function moduleFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
  professeurId: string,
): CourseModule {
  const data = doc.data();

  return {
    id: doc.id,
    professeurId,
    nom: data.nom,
    slug: data.slug,
    ordre: data.ordre,
    statut: data.statut,
    dateDebut: data.dateDebut ?? null,
    compteurCours: data.compteurCours ?? 0,
  };
}

function courseFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Course {
  const data = doc.data();

  return {
    id: doc.id,
    professeurId: data.professeurId,
    moduleId: data.moduleId,
    numero: data.numero,
    titre: data.titre ?? "",
    titreValide: data.titreValide ?? false,
    date: data.date,
    audioUrl: data.audioUrl ?? null,
    etapes: data.etapes,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

function artifactFromDoc(doc: QueryDocumentSnapshot<DocumentData>): Artifact {
  const data = doc.data();

  return {
    id: doc.id,
    type: data.type,
    contenu: data.contenu,
    version: data.version,
    createdAt: data.createdAt,
  };
}

function imageFromDoc(doc: QueryDocumentSnapshot<DocumentData>): CourseImage {
  const data = doc.data();

  return {
    id: doc.id,
    url: data.url,
    promptUtilise: data.promptUtilise,
    verification: data.verification,
    ordre: data.ordre,
    createdAt: data.createdAt,
  };
}

function referenceFromDoc(doc: QueryDocumentSnapshot<DocumentData>): CourseReference {
  const data = doc.data();

  return {
    id: doc.id,
    type: data.type,
    texteCours: data.texteCours ?? "",
    texteExact: data.texteExact ?? "",
    texteArabe: data.texteArabe ?? "",
    sourceIdentifiee: data.sourceIdentifiee ?? "",
    statutAuto: data.statutAuto,
    choixTexte: data.choixTexte ?? null,
    choixSource: data.choixSource ?? null,
    valide: data.valide ?? false,
  };
}

export async function listProfessorsWithModules(): Promise<
  ProfessorWithModules[]
> {
  const professorsSnapshot = await getDocs(
    query(collection(db, "professeurs"), orderBy("ordre", "asc")),
  );

  return Promise.all(
    professorsSnapshot.docs.map(async (professorDoc) => {
      const professor = professorFromDoc(professorDoc);
      const modulesSnapshot = await getDocs(
        query(
          collection(db, "professeurs", professor.id, "modules"),
          orderBy("ordre", "asc"),
        ),
      );

      return {
        ...professor,
        modules: modulesSnapshot.docs.map((moduleDoc) =>
          moduleFromDoc(moduleDoc, professor.id),
        ),
      };
    }),
  );
}

export async function findModuleById(
  moduleId: string,
): Promise<{ professor: Professor; module: CourseModule } | null> {
  const professors = await listProfessorsWithModules();

  for (const professor of professors) {
    const found = professor.modules.find((module) => module.id === moduleId);

    if (found) {
      return { professor, module: found };
    }
  }

  return null;
}

export async function listCoursesForModule(
  professorId: string,
  moduleId: string,
): Promise<Course[]> {
  const snapshot = await getDocs(
    query(
      collection(
        db,
        "professeurs",
        professorId,
        "modules",
        moduleId,
        "cours",
      ),
      orderBy("numero", "desc"),
    ),
  );

  return snapshot.docs.map(courseFromDoc);
}

export async function getCourseContext(
  courseId: string,
): Promise<CourseContext | null> {
  const professors = await listProfessorsWithModules();

  for (const professor of professors) {
    for (const module of professor.modules) {
      const courseDoc = await getDoc(
        doc(
          db,
          "professeurs",
          professor.id,
          "modules",
          module.id,
          "cours",
          courseId,
        ),
      );

      if (courseDoc.exists()) {
        return {
          professor,
          module,
          course: {
            id: courseDoc.id,
            ...(courseDoc.data() as Omit<Course, "id">),
          },
        };
      }
    }
  }

  return null;
}

function emptySteps(): Course["etapes"] {
  return {
    transcription: { fait: false, date: null, obsolete: false },
    correction: { fait: false, date: null, obsolete: false },
    synthese: { fait: false, date: null, obsolete: false },
    sources: { fait: false, date: null, obsolete: false },
    fiche: { fait: false, date: null, obsolete: false },
    image: { fait: false, date: null, obsolete: false },
  };
}

export async function createCourse(input: {
  professorId: string;
  moduleId: string;
  numero: number;
  titre: string;
  date: string;
  audioFile?: File | null;
}) {
  const courseId = `${input.moduleId}-${input.numero}`;
  const now = new Date().toISOString();
  const moduleRef = doc(
    db,
    "professeurs",
    input.professorId,
    "modules",
    input.moduleId,
  );
  const courseRef = doc(
    db,
    "professeurs",
    input.professorId,
    "modules",
    input.moduleId,
    "cours",
    courseId,
  );
  const [moduleDoc, existingCourseDoc] = await Promise.all([
    getDoc(moduleRef),
    getDoc(courseRef),
  ]);

  if (existingCourseDoc.exists()) {
    throw new Error(`Le cours ${input.numero} existe déjà pour ce module.`);
  }

  if (input.audioFile) {
    validateAudioFile(input.audioFile);
  }

  const audioUrl = input.audioFile
    ? await uploadCourseAudio({
        professorId: input.professorId,
        moduleId: input.moduleId,
        courseId,
        file: input.audioFile,
      })
    : null;

  const course: Omit<Course, "id"> = {
    professeurId: input.professorId,
    moduleId: input.moduleId,
    numero: input.numero,
    titre: input.titre,
    titreValide: Boolean(input.titre.trim()),
    date: input.date,
    audioUrl,
    etapes: emptySteps(),
    createdAt: now,
    updatedAt: now,
  };

  await setDoc(courseRef, course);
  await updateDoc(moduleRef, {
    compteurCours: Math.max(moduleDoc.data()?.compteurCours ?? 0, input.numero),
  });

  return courseId;
}

export function validateAudioFile(file: File) {
  if (file.size > maxAudioSize) {
    throw new Error("Le fichier audio dépasse la limite de 200 Mo.");
  }

  if (!acceptedAudioTypes.has(file.type) && !acceptedAudioExtensions.test(file.name)) {
    throw new Error("Format audio non accepté. Utilise un fichier m4a, mp3 ou wav.");
  }
}

async function uploadCourseAudio(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  file: File;
}) {
  const safeName = input.file.name.replace(/[^\w.-]+/g, "-");
  const storageRef = ref(
    storage,
    `professeurs/${input.professorId}/modules/${input.moduleId}/cours/${input.courseId}/audio/${Date.now()}-${safeName}`,
  );
  const uploaded = await uploadBytes(storageRef, input.file);

  return getDownloadURL(uploaded.ref);
}

function stepForArtifact(type: ArtifactType): keyof Course["etapes"] {
  if (type === "transcription_corrigee") {
    return "transcription";
  }

  if (type === "prompt_image") {
    return "image";
  }

  return type;
}

export async function saveArtifact(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  type: ArtifactType;
  contenu: string;
}) {
  const now = new Date().toISOString();
  const artifact: Omit<Artifact, "id"> = {
    type: input.type,
    contenu: input.contenu,
    version: 1,
    createdAt: now,
  };
  const step = stepForArtifact(input.type);

  await setDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
      "artefacts",
      input.type,
    ),
    artifact,
  );
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    {
      [`etapes.${step}.fait`]: true,
      [`etapes.${step}.date`]: now,
      [`etapes.${step}.obsolete`]: false,
      updatedAt: now,
    },
  );
}

export async function discardArtifact(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  type: ArtifactType;
}) {
  const now = new Date().toISOString();
  const step = stepForArtifact(input.type);

  await deleteDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
      "artefacts",
      input.type,
    ),
  );
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    {
      [`etapes.${step}.fait`]: false,
      [`etapes.${step}.date`]: null,
      [`etapes.${step}.obsolete`]: false,
      updatedAt: now,
    },
  );
}

export async function saveCourseImage(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  file: File;
  promptUtilise: string;
}) {
  const now = new Date().toISOString();
  const imageId = `image-${Date.now()}`;
  const storageRef = ref(
    storage,
    `professeurs/${input.professorId}/modules/${input.moduleId}/cours/${input.courseId}/images/${imageId}-${input.file.name}`,
  );
  const uploaded = await uploadBytes(storageRef, input.file);
  const url = await getDownloadURL(uploaded.ref);

  await setDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
      "images",
      imageId,
    ),
    {
      url,
      promptUtilise: input.promptUtilise,
      verification: { faite: false, conforme: false, defauts: [] },
      ordre: Date.now(),
      createdAt: now,
    },
  );
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    {
      "etapes.image.fait": true,
      "etapes.image.date": now,
      "etapes.image.obsolete": false,
      updatedAt: now,
    },
  );

  return imageId;
}

export async function saveCourseImageVerification(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  imageId: string;
  conforme: boolean;
  defauts: string[];
}) {
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
      "images",
      input.imageId,
    ),
    {
      verification: {
        faite: true,
        conforme: input.conforme,
        defauts: input.defauts,
      },
    },
  );
}

export async function markStepDone(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  step: StepKey;
}) {
  const now = new Date().toISOString();

  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    {
      [`etapes.${input.step}.fait`]: true,
      [`etapes.${input.step}.date`]: now,
      [`etapes.${input.step}.obsolete`]: false,
      updatedAt: now,
    },
  );
}

export async function updateCourseTitle(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  titre: string;
}) {
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    {
      titre: input.titre,
      titreValide: false,
      updatedAt: new Date().toISOString(),
    },
  );
}

export async function confirmCourseTitle(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  titre?: string;
}) {
  const updates: Record<string, string | boolean> = {
    titreValide: true,
    updatedAt: new Date().toISOString(),
  };

  if (input.titre !== undefined) {
    updates.titre = input.titre;
  }

  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    updates,
  );
}

export async function upsertVocabularyTerms(input: {
  professorId: string;
  moduleId: string;
  moduleSlug: string;
  courseId: string;
  courseNumero: number;
  courseDate: string;
  terms: ParsedVocabularyTerm[];
}) {
  const now = new Date().toISOString();
  const unique = new Map(input.terms.map((term) => [term.cle, term]));

  await Promise.all(
    [...unique.values()].map(async (term) => {
      const vocabRef = doc(db, "vocabulaire", term.cle);
      const existing = await getDoc(vocabRef);
      const existingData = existing.data();
      const tag = `#${input.moduleSlug}_C${input.courseNumero}`;
      const occurrence = {
        professeurId: input.professorId,
        moduleId: input.moduleId,
        coursId: input.courseId,
        coursNumero: input.courseNumero,
      };
      const existingOccurrences = (existingData?.occurrences ?? []) as Array<{
        coursId?: string;
      }>;
      const occurrences = existingOccurrences.some(
        (item) => item.coursId === input.courseId,
      )
        ? existingOccurrences
        : [...existingOccurrences, occurrence];
      const tags = Array.from(new Set([...(existingData?.tags ?? []), tag]));
      const existingGlose = existingData?.glose as string | undefined;
      const gloseAlternatives = Array.from(
        new Set([
          ...((existingData?.gloseAlternatives ?? []) as string[]),
          ...(existingGlose && existingGlose !== term.glose ? [term.glose] : []),
        ]),
      );

      await setDoc(
        vocabRef,
        {
          cle: term.cle,
          translitteration: existingData?.translitteration ?? term.translitteration,
          arabe: existingData?.arabe ?? term.arabe,
          glose: existingData?.glose ?? term.glose,
          gloseAlternatives,
          tags,
          occurrences,
          premiereApparition:
            existingData?.premiereApparition ?? {
              coursId: input.courseId,
              date: input.courseDate,
            },
          createdAt: existingData?.createdAt ?? now,
          updatedAt: now,
        },
        { merge: true },
      );
    }),
  );
}

export async function saveDetectedReferences(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  references: ParsedReference[];
}) {
  await Promise.all(
    input.references.map((reference, index) =>
      setDoc(
        doc(
          db,
          "professeurs",
          input.professorId,
          "modules",
          input.moduleId,
          "cours",
          input.courseId,
          "references",
          `ref-${String(index + 1).padStart(2, "0")}`,
        ),
        {
          ...reference,
          choixTexte: reference.statutAuto === "paraphrase" ? null : "cours",
          choixSource: null,
          valide: false,
        },
      ),
    ),
  );
}

export async function listCourseReferences(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
}) {
  const snapshot = await getDocs(
    query(
      collection(
        db,
        "professeurs",
        input.professorId,
        "modules",
        input.moduleId,
        "cours",
        input.courseId,
        "references",
      ),
      orderBy(documentId(), "asc"),
    ),
  );

  return snapshot.docs.map(referenceFromDoc);
}

export async function saveReferenceDecision(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  referenceId: string;
  choixTexte: CourseReference["choixTexte"];
  choixSource: string | null;
}) {
  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
      "references",
      input.referenceId,
    ),
    {
      choixTexte: input.choixTexte,
      choixSource: input.choixSource,
      valide: true,
    },
  );
}

export async function saveReferenceDecisions(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  decisions: Array<{
    referenceId: string;
    choixTexte: CourseReference["choixTexte"];
    choixSource: string | null;
  }>;
}) {
  await Promise.all(
    input.decisions.map((decision) =>
      saveReferenceDecision({
        professorId: input.professorId,
        moduleId: input.moduleId,
        courseId: input.courseId,
        ...decision,
      }),
    ),
  );
}

const downstreamSteps: Record<StepKey, StepKey[]> = {
  transcription: ["correction", "synthese", "sources", "fiche", "image"],
  correction: ["synthese", "sources", "fiche", "image"],
  synthese: ["sources", "fiche", "image"],
  sources: ["fiche", "image"],
  fiche: [],
  image: [],
};

export async function restartStep(input: {
  professorId: string;
  moduleId: string;
  courseId: string;
  step: StepKey;
}) {
  const now = new Date().toISOString();
  const updates: Record<string, string | boolean | null> = {
    [`etapes.${input.step}.fait`]: false,
    [`etapes.${input.step}.date`]: null,
    [`etapes.${input.step}.obsolete`]: false,
    updatedAt: now,
  };

  for (const step of downstreamSteps[input.step]) {
    updates[`etapes.${step}.obsolete`] = true;
  }

  await updateDoc(
    doc(
      db,
      "professeurs",
      input.professorId,
      "modules",
      input.moduleId,
      "cours",
      input.courseId,
    ),
    updates,
  );
}

export async function listDocumentsForRayon(
  moduleId: string,
  type: ArtifactType,
): Promise<LibraryDocument[]> {
  const found = await findModuleById(moduleId);

  if (!found) {
    return [];
  }

  const courses = await listCoursesForModule(found.professor.id, found.module.id);
  const documents = await Promise.all(
    courses.map(async (course) => {
      const artifactDoc = await getDoc(
        doc(
          db,
          "professeurs",
          found.professor.id,
          "modules",
          found.module.id,
          "cours",
          course.id,
          "artefacts",
          type,
        ),
      );

      if (!artifactDoc.exists()) {
        return null;
      }

      return {
        course,
        artifact: {
          id: artifactDoc.id,
          ...(artifactDoc.data() as Omit<Artifact, "id">),
        },
        module: found.module,
        professor: found.professor,
      };
    }),
  );

  return documents.filter((document): document is LibraryDocument =>
    Boolean(document),
  );
}

export async function listImagesForModule(
  moduleId: string,
): Promise<LibraryImage[]> {
  const found = await findModuleById(moduleId);

  if (!found) {
    return [];
  }

  const courses = await listCoursesForModule(found.professor.id, found.module.id);
  const images = await Promise.all(
    courses.map(async (course) => {
      const snapshot = await getDocs(
        query(
          collection(
            db,
            "professeurs",
            found.professor.id,
            "modules",
            found.module.id,
            "cours",
            course.id,
            "images",
          ),
          orderBy("ordre", "asc"),
        ),
      );

      return snapshot.docs.map((imageDoc) => ({
        course,
        image: imageFromDoc(imageDoc),
        module: found.module,
        professor: found.professor,
      }));
    }),
  );

  return images.flat();
}

export async function getLibraryDocument(
  courseId: string,
  type: ArtifactType,
): Promise<LibraryDocument | null> {
  const context = await getCourseContext(courseId);

  if (!context) {
    return null;
  }

  const artifactDoc = await getDoc(
    doc(
      db,
      "professeurs",
      context.professor.id,
      "modules",
      context.module.id,
      "cours",
      courseId,
      "artefacts",
      type,
    ),
  );

  if (!artifactDoc.exists()) {
    return null;
  }

  return {
    course: context.course,
    artifact: {
      id: artifactDoc.id,
      ...(artifactDoc.data() as Omit<Artifact, "id">),
    },
    module: context.module,
    professor: context.professor,
  };
}

export async function getArtifactEditorData(courseId: string, type: ArtifactType) {
  const context = await getCourseContext(courseId);

  if (!context) {
    return null;
  }

  const document = await getLibraryDocument(courseId, type);

  return {
    ...context,
    artifact: document?.artifact ?? null,
  };
}

export async function getCourseArtifacts(
  document: LibraryDocument,
): Promise<Artifact[]> {
  const snapshot = await getDocs(
    collection(
      db,
      "professeurs",
      document.professor.id,
      "modules",
      document.module.id,
      "cours",
      document.course.id,
      "artefacts",
    ),
  );

  return snapshot.docs.map(artifactFromDoc);
}

export async function getCourseArtifactsByPath(
  professorId: string,
  moduleId: string,
  courseId: string,
): Promise<Artifact[]> {
  const snapshot = await getDocs(
    collection(
      db,
      "professeurs",
      professorId,
      "modules",
      moduleId,
      "cours",
      courseId,
      "artefacts",
    ),
  );

  return snapshot.docs.map(artifactFromDoc);
}

export async function getCourseImagesByPath(
  professorId: string,
  moduleId: string,
  courseId: string,
): Promise<CourseImage[]> {
  const snapshot = await getDocs(
    query(
      collection(
        db,
        "professeurs",
        professorId,
        "modules",
        moduleId,
        "cours",
        courseId,
        "images",
      ),
      orderBy("ordre", "asc"),
    ),
  );

  return snapshot.docs.map(imageFromDoc);
}

export async function getModuleExportData(
  moduleId: string,
): Promise<ModuleExportData | null> {
  const found = await findModuleById(moduleId);

  if (!found) {
    return null;
  }

  const courses = await listCoursesForModule(found.professor.id, found.module.id);
  const courseData = await Promise.all(
    courses.map(async (course) => ({
      course,
      artifacts: await getCourseArtifactsByPath(
        found.professor.id,
        found.module.id,
        course.id,
      ),
      images: await getCourseImagesByPath(
        found.professor.id,
        found.module.id,
        course.id,
      ),
    })),
  );

  return {
    professor: found.professor,
    module: found.module,
    courses: courseData,
  };
}

export async function getLibraryImage(
  courseId: string,
  imageId: string,
): Promise<LibraryImage | null> {
  const professors = await listProfessorsWithModules();

  for (const professor of professors) {
    for (const module of professor.modules) {
      const courseDoc = await getDoc(
        doc(
          db,
          "professeurs",
          professor.id,
          "modules",
          module.id,
          "cours",
          courseId,
        ),
      );

      if (!courseDoc.exists()) {
        continue;
      }

      const imageDoc = await getDoc(
        doc(
          db,
          "professeurs",
          professor.id,
          "modules",
          module.id,
          "cours",
          courseId,
          "images",
          imageId,
        ),
      );

      if (!imageDoc.exists()) {
        return null;
      }

      return {
        course: {
          id: courseDoc.id,
          ...(courseDoc.data() as Omit<Course, "id">),
        },
        image: {
          id: imageDoc.id,
          ...(imageDoc.data() as Omit<CourseImage, "id">),
        },
        module,
        professor,
      };
    }
  }

  return null;
}
