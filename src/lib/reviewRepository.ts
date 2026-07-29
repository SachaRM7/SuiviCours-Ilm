import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export type ReviewKind = "course" | "artifact" | "source" | "image" | "term";

export type ReviewMark = {
  id: string;
  kind: ReviewKind;
  itemId: string;
  label: string;
  href: string;
  meta?: string;
  createdAt: string;
};

function markId(kind: ReviewKind, itemId: string) {
  return `${kind}_${itemId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function reviewMarkFromDoc(
  doc: QueryDocumentSnapshot<DocumentData>,
): ReviewMark {
  const data = doc.data();

  return {
    id: doc.id,
    kind: data.kind,
    itemId: data.itemId,
    label: data.label,
    href: data.href,
    meta: data.meta ?? "",
    createdAt: data.createdAt,
  };
}

export async function getReviewMark(input: {
  kind: ReviewKind;
  itemId: string;
}) {
  const snapshot = await getDoc(doc(db, "reviewMarks", markId(input.kind, input.itemId)));

  return snapshot.exists() ? reviewMarkFromDoc(snapshot) : null;
}

export async function listReviewMarks() {
  const snapshot = await getDocs(
    query(collection(db, "reviewMarks"), orderBy("createdAt", "desc")),
  );

  return snapshot.docs.map(reviewMarkFromDoc);
}

export async function setReviewMark(input: {
  kind: ReviewKind;
  itemId: string;
  label: string;
  href: string;
  meta?: string;
}) {
  const id = markId(input.kind, input.itemId);
  const mark: Omit<ReviewMark, "id"> = {
    kind: input.kind,
    itemId: input.itemId,
    label: input.label,
    href: input.href,
    meta: input.meta ?? "",
    createdAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "reviewMarks", id), mark);
}

export async function clearReviewMark(input: {
  kind: ReviewKind;
  itemId: string;
}) {
  await deleteDoc(doc(db, "reviewMarks", markId(input.kind, input.itemId)));
}
