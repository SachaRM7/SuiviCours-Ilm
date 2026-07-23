import { httpsCallable } from "firebase/functions";
import { firebaseFunctions } from "./firebase";

export type AiProvider = "openai" | "anthropic";

export type AiGenerationResult = {
  text: string;
  provider: AiProvider;
  model: string;
};

const generatePipelineStep = httpsCallable<
  { provider: AiProvider; model: string; prompt: string },
  AiGenerationResult
>(firebaseFunctions, "generatePipelineStep");

export async function generateWithAi(input: {
  provider: AiProvider;
  model: string;
  prompt: string;
}) {
  const response = await generatePipelineStep(input);

  return response.data;
}
