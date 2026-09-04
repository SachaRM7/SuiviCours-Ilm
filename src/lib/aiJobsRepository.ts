import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, firebaseFunctions } from "./firebase";
import type { AiProvider, AiReasoningEffort } from "./aiRepository";
import type { StepKey } from "../types/domain";

export type AiJobStatus = "queued" | "running" | "completed" | "failed";

export type AiJob = {
  id: string;
  courseId: string;
  courseTitle: string;
  step: StepKey;
  stepTitle: string;
  status: AiJobStatus;
  text?: string;
  error?: string;
  acknowledgedAt?: unknown;
};

const startPipelineJob = httpsCallable<
  {
    provider: AiProvider;
    model: string;
    prompt: string;
    reasoningEffort?: AiReasoningEffort;
    task: StepKey;
    courseId: string;
    courseTitle: string;
    stepTitle: string;
  },
  { jobId: string }
>(firebaseFunctions, "startPipelineJob");

function jobsCollection() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Connexion requise pour lancer une génération.");
  return collection(db, "users", uid, "aiJobs");
}

export async function queueAiGeneration(input: {
  provider: AiProvider;
  model: string;
  prompt: string;
  reasoningEffort?: AiReasoningEffort;
  task: StepKey;
  courseId: string;
  courseTitle: string;
  stepTitle: string;
}) {
  const response = await startPipelineJob(input);
  return response.data;
}

export function subscribeToAiJobs(
  onJobs: (jobs: AiJob[]) => void,
  onError?: (error: Error) => void,
) {
  const jobsQuery = query(jobsCollection(), orderBy("createdAt", "desc"), limit(30));
  return onSnapshot(
    jobsQuery,
    (snapshot) => {
      onJobs(
        snapshot.docs.map((job) => {
          const data = job.data();
          return {
            id: job.id,
            courseId: data.courseId,
            courseTitle: data.courseTitle,
            step: data.task,
            stepTitle: data.stepTitle,
            status: data.status,
            text: data.text,
            error: data.error,
            acknowledgedAt: data.acknowledgedAt,
          } as AiJob;
        }),
      );
    },
    (error) => onError?.(error),
  );
}

export async function acknowledgeAiJob(jobId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateDoc(doc(db, "users", uid, "aiJobs", jobId), {
    acknowledgedAt: serverTimestamp(),
  });
}