import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";

const openaiApiKey = defineSecret("OPENAI_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const allowedUid = defineSecret("ALLOWED_UID");

const providerConfig = {
  openai: {
    defaultModel: "gpt-5.6-luna",
    endpoint: "https://api.openai.com/v1/responses",
  },
  anthropic: {
    defaultModel: "claude-sonnet-5-20260715",
    endpoint: "https://api.anthropic.com/v1/messages",
  },
};

function requireString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpsError("invalid-argument", `${field} est requis.`);
  }

  return value.trim();
}

function assertAllowed(context) {
  const uid = context.auth?.uid;

  if (!uid) {
    throw new HttpsError("unauthenticated", "Connexion requise.");
  }

  const expectedUid = allowedUid.value();
  if (expectedUid && uid !== expectedUid) {
    throw new HttpsError("permission-denied", "Compte non autorisé.");
  }
}

async function callOpenAI({ prompt, model }) {
  const apiKey = openaiApiKey.value();
  if (!apiKey) {
    throw new HttpsError("failed-precondition", "OPENAI_API_KEY n'est pas configurée.");
  }

  const response = await fetch(providerConfig.openai.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: prompt,
      reasoning: { effort: "medium" },
    }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      body.error?.message ?? "Erreur OpenAI.",
    );
  }

  const outputText =
    body.output_text ??
    body.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text ?? "")
      .join("")
      .trim();

  if (!outputText) {
    throw new HttpsError("internal", "Réponse OpenAI vide.");
  }

  return outputText;
}

async function callAnthropic({ prompt, model }) {
  const apiKey = anthropicApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "ANTHROPIC_API_KEY n'est pas configurée.",
    );
  }

  const response = await fetch(providerConfig.anthropic.endpoint, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 12000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const body = await response.json();

  if (!response.ok) {
    throw new HttpsError(
      "internal",
      body.error?.message ?? "Erreur Anthropic.",
    );
  }

  const outputText = body.content
    ?.map((part) => (part.type === "text" ? part.text : ""))
    .join("")
    .trim();

  if (!outputText) {
    throw new HttpsError("internal", "Réponse Anthropic vide.");
  }

  return outputText;
}

export const generatePipelineStep = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: [openaiApiKey, anthropicApiKey, allowedUid],
  },
  async (request) => {
    assertAllowed(request);

    const provider = requireString(request.data?.provider, "provider");
    const prompt = requireString(request.data?.prompt, "prompt");
    const config = providerConfig[provider];

    if (!config) {
      throw new HttpsError("invalid-argument", "Provider IA inconnu.");
    }

    const model =
      typeof request.data?.model === "string" && request.data.model.trim()
        ? request.data.model.trim()
        : config.defaultModel;

    const text =
      provider === "openai"
        ? await callOpenAI({ prompt, model })
        : await callAnthropic({ prompt, model });

    return { text, provider, model };
  },
);
