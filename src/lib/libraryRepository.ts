import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type {
  Artifact,
  ArtifactType,
  Course,
  CourseImage,
  CourseModule,
  LibraryDocument,
  LibraryImage,
  Professor,
} from "../types/domain";

export type ProfessorWithModules = Professor & {
  modules: CourseModule[];
};

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

      const artifactDoc = await getDoc(
        doc(
          db,
          "professeurs",
          professor.id,
          "modules",
          module.id,
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
        course: {
          id: courseDoc.id,
          ...(courseDoc.data() as Omit<Course, "id">),
        },
        artifact: {
          id: artifactDoc.id,
          ...(artifactDoc.data() as Omit<Artifact, "id">),
        },
        module,
        professor,
      };
    }
  }

  return null;
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
