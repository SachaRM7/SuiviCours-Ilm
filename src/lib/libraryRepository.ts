import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type { CourseModule, Professor } from "../types/domain";

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
