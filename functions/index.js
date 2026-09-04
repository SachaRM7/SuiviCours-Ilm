import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";

initializeApp();

const openaiApiKey = defineSecret("OPENAI_API_KEY");
const anthropicApiKey = defineSecret("ANTHROPIC_API_KEY");
const groqApiKey = defineSecret("GROQ_API_KEY");
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
  groq: {
    defaultModel: "qwen/qwen3.8-27b",
    endpoint: "https://api.groq.com/openai/v1/chat/completions",
  },
};

const groqModels = new Set([providerConfig.groq.defaultModel]);
const reasoningEfforts = new Set(["none", "low", "medium", "high"]);
const audioBucket = "suivi-cours-ilm.firebasestorage.app";
const maxFreeAudioSize = 25 * 1024 * 1024;
const whisperModel = "whisper-large-v3";
const whisperEndpoint = "https://api.groq.com/openai/v1/audio/transcriptions";
const sourceMarker = "\n\n---\n\nCONTENU SOURCE\n\n";
const groqChunkTargetCharacters = 18000;
const groqChunkDelayMs = 61000;

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

  const expectedUid = allowedUid.value().trim();
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

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function splitSourceText(source, maxCharacters) {
  const chunks = [];
  let remaining = source.trim();

  while (remaining.length > maxCharacters) {
    const window = remaining.slice(0, maxCharacters + 1);
    const minimumBoundary = Math.floor(maxCharacters * 0.6);
    let boundary = window.lastIndexOf("\n\n");

    if (boundary < minimumBoundary) {
      boundary = window.lastIndexOf(". ");
      if (boundary >= minimumBoundary) {
        boundary += 1;
      }
    }
    if (boundary < minimumBoundary) {
      boundary = window.lastIndexOf(" ");
    }
    if (boundary < minimumBoundary) {
      boundary = maxCharacters;
    }

    chunks.push(remaining.slice(0, boundary).trim());
    remaining = remaining.slice(boundary).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function callGroqRequest({ apiKey, prompt, model, reasoningEffort, part }) {
  console.info("Groq generation started", {
    model,
    reasoningEffort,
    promptCharacters: prompt.length,
    part,
  });
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(providerConfig.groq.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_completion_tokens: 16384,
        reasoning_effort: reasoningEffort,
      }),
    });
  } catch (error) {
    console.error("Groq generation network failure", error);
    throw new HttpsError(
      "unavailable",
      "Groq ne répond pas actuellement. Réessaie dans quelques instants.",
    );
  }
  const body = await response.json();

  if (!response.ok) {
    console.error("Groq generation failed", {
      status: response.status,
      message: body.error?.message,
      promptCharacters: prompt.length,
      part,
    });
    throw new HttpsError(
      response.status === 429
        ? "resource-exhausted"
        : response.status === 413
          ? "invalid-argument"
          : "failed-precondition",
      body.error?.message ?? "Erreur Groq.",
    );
  }

  const outputText = body.choices?.[0]?.message?.content?.trim();
  if (!outputText) {
    throw new HttpsError("failed-precondition", "Reponse Groq vide.");
  }

  console.info("Groq generation completed", {
    model,
    durationMs: Date.now() - startedAt,
    outputCharacters: outputText.length,
    part,
  });

  return outputText;
}

async function callGroq({ prompt, model, reasoningEffort, task }) {
  const apiKey = groqApiKey.value().trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GROQ_API_KEY n'est pas configuree.",
    );
  }

  if (!groqModels.has(model)) {
    throw new HttpsError("invalid-argument", "Modele Groq non autorise.");
  }

  const markerIndex = prompt.indexOf(sourceMarker);
  if (
    task !== "correction" ||
    prompt.length <= groqChunkTargetCharacters ||
    markerIndex < 0
  ) {
    return callGroqRequest({
      apiKey,
      prompt,
      model,
      reasoningEffort,
      part: "1/1",
    });
  }

  const instructions = prompt.slice(0, markerIndex);
  const source = prompt.slice(markerIndex + sourceMarker.length);
  const segmentDirective =
    "\n\nMODE SEGMENT : corrige uniquement le segment fourni. Retourne seulement le texte corrige, sans titre, sans introduction, sans conclusion, sans liste de termes et sans commentaire. Ne resume rien.\n";
  const maxSourceCharacters = Math.max(
    4000,
    groqChunkTargetCharacters - instructions.length - segmentDirective.length - sourceMarker.length,
  );
  const sourceChunks = splitSourceText(source, maxSourceCharacters);
  const correctedChunks = [];

  console.info("Groq long generation split", {
    promptCharacters: prompt.length,
    instructionCharacters: instructions.length,
    sourceCharacters: source.length,
    chunks: sourceChunks.length,
    maxSourceCharacters,
  });

  for (const [index, sourceChunk] of sourceChunks.entries()) {
    if (index > 0) {
      await wait(groqChunkDelayMs);
    }

    correctedChunks.push(
      await callGroqRequest({
        apiKey,
        prompt: `${instructions}${segmentDirective}${sourceMarker}${sourceChunk}`,
        model,
        reasoningEffort,
        part: `${index + 1}/${sourceChunks.length}`,
      }),
    );
  }

  return correctedChunks.join("\n\n");
}

function validateCourseAudioUrl(audioUrl, storagePath) {
  let parsed;

  try {
    parsed = new URL(audioUrl);
  } catch {
    throw new HttpsError("invalid-argument", "Adresse du fichier audio invalide.");
  }

  const expectedPrefix = `/v0/b/${audioBucket}/o/`;
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "firebasestorage.googleapis.com" ||
    !parsed.pathname.startsWith(expectedPrefix) ||
    decodeURIComponent(parsed.pathname.slice(expectedPrefix.length)) !== storagePath ||
    !storagePath.startsWith("professeurs/") ||
    !storagePath.includes("/cours/") ||
    !storagePath.includes("/audio/")
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Le fichier doit provenir de l'espace audio de ce cours.",
    );
  }
}

async function callGroqWhisper({ audioBuffer, contentType, fileName }) {
  const apiKey = groqApiKey.value().trim();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "GROQ_API_KEY n'est pas configuree.",
    );
  }

  const form = new FormData();
  form.append("file", new Blob([audioBuffer], { type: contentType }), fileName);
  form.append("model", whisperModel);
  form.append("language", "fr");
  form.append("response_format", "json");
  form.append("temperature", "0");
  form.append(
    "prompt",
    "Cours de sciences islamiques principalement en francais, avec des mots, noms propres et notions en arabe. Transcrire fidelement le francais et conserver avec soin les termes arabes tels qu'ils sont prononces. Ne pas traduire, resumer ni commenter.",
  );

  const response = await fetch(whisperEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: form,
  });
  const body = await response.json();

  if (!response.ok) {
    console.error("Groq Whisper request failed", {
      status: response.status,
      message: body.error?.message,
    });
    throw new HttpsError(
      response.status === 413 ? "invalid-argument" : "failed-precondition",
      body.error?.message ?? "La transcription Groq a echoue.",
    );
  }

  const text = body.text?.trim();
  if (!text) {
    throw new HttpsError("internal", "La transcription Groq est vide.");
  }

  return text;
}

export const generatePipelineStep = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: [openaiApiKey, anthropicApiKey, groqApiKey, allowedUid],
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
    const requestedReasoningEffort = request.data?.reasoningEffort;
    const task =
      typeof request.data?.task === "string" ? request.data.task.trim() : "";
    const reasoningEffort = reasoningEfforts.has(requestedReasoningEffort)
      ? requestedReasoningEffort
      : "medium";

    let text;
    if (provider === "openai") {
      text = await callOpenAI({ prompt, model });
    } else if (provider === "anthropic") {
      text = await callAnthropic({ prompt, model });
    } else {
      text = await callGroq({ prompt, model, reasoningEffort, task });
    }

    return { text, provider, model };
  },
);

export const transcribeCourseAudio = onCall(
  {
    region: "europe-west1",
    timeoutSeconds: 540,
    memory: "1GiB",
    secrets: [groqApiKey, allowedUid],
  },
  async (request) => {
    assertAllowed(request);

    const audioUrl = requireString(request.data?.audioUrl, "audioUrl");
    const storagePath = requireString(request.data?.storagePath, "storagePath");
    validateCourseAudioUrl(audioUrl, storagePath);

    const storedFile = getStorage().bucket(audioBucket).file(storagePath);
    let metadata;
    try {
      [metadata] = await storedFile.getMetadata();
    } catch {
      throw new HttpsError("not-found", "Le fichier audio est introuvable.");
    }

    const size = Number(metadata.size ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size > maxFreeAudioSize) {
      throw new HttpsError(
        "invalid-argument",
        "Le Free Tier Groq accepte au maximum 25 Mo par fichier audio.",
      );
    }

    if (!metadata.contentType?.startsWith("audio/")) {
      throw new HttpsError("invalid-argument", "Le fichier depose n'est pas un audio.");
    }

    let audioBuffer;
    try {
      [audioBuffer] = await storedFile.download();
    } catch (error) {
      console.error("Course audio download failed", error);
      throw new HttpsError("internal", "Impossible de lire le fichier audio stocke.");
    }

    const text = await callGroqWhisper({
      audioBuffer,
      contentType: metadata.contentType,
      fileName: storagePath.split("/").pop() ?? "cours-audio.mp3",
    });
    return { text, model: whisperModel };
  },
);
