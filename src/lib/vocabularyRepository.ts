import {
  collection,
  getDocs,
  orderBy,
  query,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import type { VocabularyEntry } from "../types/domain";

function vocabularyFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): VocabularyEntry {
  const data = doc.data();

  return {
    id: doc.id,
    cle: data.cle,
    translitteration: data.translitteration,
    arabe: data.arabe,
    glose: data.glose,
    tags: data.tags ?? [],
    occurrences: data.occurrences ?? [],
    premiereApparition: data.premiereApparition,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

export async function listVocabulary() {
  const snapshot = await getDocs(
    query(collection(db, "vocabulaire"), orderBy("translitteration", "asc")),
  );

  return snapshot.docs.map(vocabularyFromDoc);
}
