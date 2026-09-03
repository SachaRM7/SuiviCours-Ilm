import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

function stateRef(key: string) {
  const uid = auth.currentUser?.uid;

  if (!uid) {
    throw new Error("Connexion requise pour synchroniser ce brouillon.");
  }

  return doc(db, "users", uid, "appState", key.replaceAll("/", "_"));
}

export async function getCloudState<T>(key: string): Promise<T | null> {
  const snapshot = await getDoc(stateRef(key));

  return snapshot.exists() ? (snapshot.data().value as T) : null;
}

export async function saveCloudState<T>(key: string, value: T) {
  await setDoc(stateRef(key), {
    value,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearCloudState(key: string) {
  await deleteDoc(stateRef(key));
}
