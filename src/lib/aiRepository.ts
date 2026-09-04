import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";

export type AiProvider = "openai" | "anthropic" | "groq";
export type AiReasoningEffort = "none" | "low" | "medium" | "high";

export type AiGenerationResult = {
  text: string;
  provider: AiProvider;
  model: string;
};

export type AudioTranscriptionResult = {
  text: string;
  model: string;
};

const generatePipelineStep = httpsCallable<
  {
    provider: AiProvider;
    model: string;
    prompt: string;
    reasoningEffort?: AiReasoningEffort;
    task?: string;
  },
  AiGenerationResult
>(firebaseFunctions, "generatePipelineStep", { timeout: 540_000 });

const transcribeCourseAudio = httpsCallable<
  { audioUrl: string; storagePath: string },
  AudioTranscriptionResult
>(firebaseFunctions, "transcribeCourseAudio");

export async function generateWithAi(input: {
  provider: AiProvider;
  model: string;
  prompt: string;
  reasoningEffort?: AiReasoningEffort;
  task?: string;
}) {
  const response = await generatePipelineStep(input);

  return response.data;
}

export async function transcribeWithAi(input: {
  audioUrl: string;
  storagePath: string;
}) {
  const response = await transcribeCourseAudio(input);

  return response.data;
}
