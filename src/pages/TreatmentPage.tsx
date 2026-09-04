import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { useAiJobs } from "../hooks/useAiJobs";
import { transcribeWithAi } from "../lib/aiRepository";
import { acknowledgeAiJob, queueAiGeneration } from "../lib/aiJobsRepository";
import { getCloudState, saveCloudState } from "../lib/cloudStateRepository";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  markStepDone,
  restartStep,
  deleteCourseAudioPart,
  saveCourseAudioParts,
  saveCourseAudioPartsOrder,
  saveArtifact,
  saveDetectedReferences,
  updateCourseTitle,
  upsertVocabularyTerms,
  validateAudioFile,
} from "../lib/libraryRepository";
import {
  parseGlossaryTerms,
  parseNewTerms,
  parseReferences,
  parseShortTitle,
} from "../lib/pipelineParsers";
import { buildPromptPayload } from "../lib/promptRepository";
import type {
  ArtifactType,
  Course,
  CourseAudioPart,
  PromptStep,
  StepKey,
} from "../types/domain";
import type { AiProvider, AiReasoningEffort } from "../lib/aiRepository";

type StepDefinition = {
  key: StepKey;
  promptStep: PromptStep;
  title: string;
  description: string;
  supportHint: string;
  resultArtifactType?: ArtifactType;
  sourceArtifactType?: ArtifactType;
  unlocksAfter?: StepKey;
  destination: string;
  recommendedModelId?: AiModelId;
  reasoningEffort?: AiReasoningEffort;
};

type AiModelId = "qwen" | "luna" | "sonnet" | "opus";

type AiModelOption = {
  id: AiModelId;
  label: string;
  provider: AiProvider;
  model: string;
  tone: string;
};

type PromptFallback = {
  stepKey: StepKey;
  title: string;
  payload: string;
};

type TreatmentCloudDraft = {
  results: Record<StepKey, string>;
  selectedAiModels: Partial<Record<StepKey, AiModelId>>;
};

function emptyResults(): Record<StepKey, string> {
  return {
    transcription: "",
    correction: "",
    synthese: "",
    sources: "",
    fiche: "",
    image: "",
  };
}

const aiModelOptions: AiModelOption[] = [
  {
    id: "qwen",
    label: "Qwen 3.8 27B",
    provider: "groq",
    model: "qwen/qwen3.8-27b",
    tone: "Rapide sur Groq, raisonnement adapté",
  },
  {
    id: "luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    model: "gpt-5.6-luna",
    tone: "Rapide, propre, économique",
  },
  {
    id: "sonnet",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    model: "claude-sonnet-5-20260715",
    tone: "Équilibre qualité/coût",
  },
  {
    id: "opus",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    model: "claude-opus-4-8",
    tone: "Pour les cas exigeants",
  },
];

const steps: StepDefinition[] = [
  {
    key: "transcription",
    promptStep: "transcription",
    title: "Transcription",
    description: "Déposer l'audio puis obtenir sa transcription automatique.",
    supportHint:
      "Fichier m4a, mp3 ou wav de 25 Mo maximum pour le Free Tier Groq.",
    resultArtifactType: "transcription_brute",
    destination: "Groq · Whisper Large V3",
  },
  {
    key: "correction",
    promptStep: "correction",
    title: "Correction",
    description: "Nettoyer les termes et produire la transcription corrigée.",
    supportHint:
      "La transcription brute enregistrée à l'étape précédente est jointe automatiquement.",
    resultArtifactType: "transcription_corrigee",
    sourceArtifactType: "transcription_brute",
    destination: "IA",
    recommendedModelId: "qwen",
    reasoningEffort: "low",
  },
  {
    key: "synthese",
    promptStep: "synthese",
    title: "Synthèse",
    description: "Structurer le cours en document lisible.",
    supportHint: "À joindre au prompt : la transcription corrigée.",
    resultArtifactType: "synthese",
    sourceArtifactType: "transcription_corrigee",
    unlocksAfter: "correction",
    destination: "IA",
    recommendedModelId: "qwen",
    reasoningEffort: "medium",
  },
  {
    key: "sources",
    promptStep: "sources",
    title: "Sources",
    description: "Identifier les références citées.",
    supportHint: "À joindre au prompt : la synthèse du cours.",
    sourceArtifactType: "synthese",
    unlocksAfter: "synthese",
    destination: "IA",
    recommendedModelId: "qwen",
    reasoningEffort: "high",
  },
  {
    key: "fiche",
    promptStep: "fiche",
    title: "Fiche de révision",
    description: "Condenser l'essentiel en une page mémorisable.",
    supportHint: "À joindre au prompt : la synthèse et les sources validées.",
    resultArtifactType: "fiche",
    sourceArtifactType: "synthese",
    unlocksAfter: "sources",
    destination: "IA",
    recommendedModelId: "qwen",
    reasoningEffort: "medium",
  },
  {
    key: "image",
    promptStep: "prompt_image",
    title: "Fiche image",
    description: "Générer le prompt, déposer l'image, puis vérifier.",
    supportHint: "À joindre au prompt : la fiche de révision.",
    resultArtifactType: "prompt_image",
    sourceArtifactType: "fiche",
    unlocksAfter: "fiche",
    destination: "IA",
    recommendedModelId: "qwen",
    reasoningEffort: "medium",
  },
];

function isUnlocked(course: Course, step: StepDefinition) {
  return !step.unlocksAfter || course.etapes[step.unlocksAfter].fait;
}

function currentStep(course: Course) {
  return (
    steps.find((step) => isUnlocked(course, step) && !course.etapes[step.key].fait) ??
    null
  );
}

function formatDate(value: string | null) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function pastePlaceholder(step: StepDefinition) {
  if (step.key === "transcription") {
    return "La transcription apparaîtra ici. Tu pourras la relire et la corriger avant de l'enregistrer.";
  }

  if (step.key === "sources") {
    return "Colle ici la réponse Claude de recherche des sources. L'app extraira les références, puis ouvrira l'écran de validation.";
  }

  if (step.resultArtifactType) {
    return "Colle ici le résultat produit…";
  }

  return "Cette étape ne conserve pas d'artefact. Tu peux la marquer comme faite.";
}

function saveLabel(step: StepDefinition) {
  return step.key === "sources" ? "Extraire les références" : "Enregistrer";
}

async function copyText(value: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back to a selected textarea for mobile browsers with strict gestures.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, value.length);

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

export function TreatmentPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyStep, setBusyStep] = useState<StepKey | null>(null);
  const [queueingStep, setQueueingStep] = useState<StepKey | null>(null);
  const [selectedAiModels, setSelectedAiModels] = useState<
    Partial<Record<StepKey, AiModelId>>
  >({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [promptFallback, setPromptFallback] = useState<PromptFallback | null>(
    null,
  );
  const [results, setResults] = useState<Record<StepKey, string>>(emptyResults);
  const [draftReady, setDraftReady] = useState(false);
  const [draftStatus, setDraftStatus] = useState<
    "loading" | "saving" | "saved" | "error"
  >("loading");
  const [notice, setNotice] = useState<string | null>(null);
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [audioBusy, setAudioBusy] = useState<"upload" | "transcribe" | null>(
    null,
  );
  const [audioProgress, setAudioProgress] = useState({ current: 0, total: 0 });
  const aiJobs = useAiJobs();
  const handledJobIds = useRef(new Set<string>());

  useEffect(() => {
    let active = true;

    setDraftReady(false);
    setDraftStatus("loading");
    setResults(emptyResults());
    setSelectedAiModels({});

    if (!courseId) {
      return () => {
        active = false;
      };
    }

    getCloudState<TreatmentCloudDraft>(`treatment-${courseId}`)
      .then((draft) => {
        if (!active || !draft) {
          return;
        }

        setResults({ ...emptyResults(), ...draft.results });
        setSelectedAiModels(draft.selectedAiModels ?? {});
      })
      .catch(() => {
        if (active) {
          setDraftStatus("error");
        }
      })
      .finally(() => {
        if (active) {
          setDraftReady(true);
          setDraftStatus((current) => (current === "error" ? current : "saved"));
        }
      });

    return () => {
      active = false;
    };
  }, [courseId]);

  useEffect(() => {
    if (!courseId || !draftReady) {
      return;
    }

    setDraftStatus("saving");
    const timeout = window.setTimeout(() => {
      void saveCloudState<TreatmentCloudDraft>(`treatment-${courseId}`, {
        results,
        selectedAiModels,
      })
        .then(() => setDraftStatus("saved"))
        .catch(() => setDraftStatus("error"));
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [courseId, draftReady, results, selectedAiModels]);
  const courseAiJobs = useMemo(
    () => aiJobs.filter((job) => job.courseId === courseId),
    [aiJobs, courseId],
  );

  useEffect(() => {
    if (!draftReady) return;

    const unacknowledged = courseAiJobs.filter(
      (job) => !job.acknowledgedAt && !handledJobIds.current.has(job.id),
    );
    if (!unacknowledged.length) return;

    const completedSteps = new Set<StepKey>();
    const completed = unacknowledged.filter((job) => job.status === "completed");
    const failed = unacknowledged.filter((job) => job.status === "failed");

    for (const job of completed) {
      handledJobIds.current.add(job.id);
      if (!completedSteps.has(job.step) && job.text) {
        completedSteps.add(job.step);
        setResults((current) => ({ ...current, [job.step]: job.text ?? "" }));
        setNotice(
          job.stepTitle + " terminée. Le résultat est prêt à être relu puis enregistré.",
        );
      }
      void acknowledgeAiJob(job.id);
    }

    if (failed.length) {
      setAiError(failed[0].error ?? "La génération IA a échoué.");
      for (const job of failed) {
        handledJobIds.current.add(job.id);
        void acknowledgeAiJob(job.id);
      }
    }
  }, [courseAiJobs, draftReady]);

  function activeJobFor(step: StepKey) {
    return courseAiJobs.find(
      (job) =>
        job.step === step &&
        (job.status === "queued" || job.status === "running"),
    );
  }

  function isStepGenerating(step: StepKey) {
    return queueingStep === step || Boolean(activeJobFor(step));
  }
  const load = useCallback(async () => {
    void reloadKey;
    if (!courseId) {
      return null;
    }

    const context = await getCourseContext(courseId);
    if (!context) {
      return null;
    }

    const artifacts = await getCourseArtifactsByPath(
      context.professor.id,
      context.module.id,
      context.course.id,
    );

    return { ...context, artifacts };
  }, [courseId, reloadKey]);
  const { data, error, loading } = useAsync(load);
  const progress = useMemo(() => {
    const done = steps.filter((step) => data?.course.etapes[step.key].fait).length;
    return { done, total: steps.length };
  }, [data?.course.etapes]);

  function getSelectedAiModel(step: StepDefinition) {
    if (!step.recommendedModelId) {
      return null;
    }

    const modelId = selectedAiModels[step.key] ?? step.recommendedModelId;
    return aiModelOptions.find((option) => option.id === modelId) ?? null;
  }

  async function preparePrompt(step: StepDefinition) {
    if (!data) {
      return null;
    }

    return buildPromptPayload({
      context: {
        professor: data.professor,
        module: data.module,
        course: data.course,
      },
      artifacts: data.artifacts,
      etape: step.promptStep,
      sourceArtifactType: step.sourceArtifactType,
      includeSourceArtifact: false,
    });
  }

  async function handleShowPrompt(step: StepDefinition) {
    setNotice(null);
    setAiError(null);

    try {
      const payload = await preparePrompt(step);
      if (!payload) {
        return;
      }

      setPromptFallback({ stepKey: step.key, title: step.title, payload });
      setNotice("Prompt prêt dans l'étape concernée.");
    } catch (copyError) {
      setAiError(
        copyError instanceof Error
          ? copyError.message
          : "Impossible de préparer ce prompt.",
      );
    }
  }

  async function handleCopyPrompt(step: StepDefinition) {
    setNotice(null);
    setAiError(null);

    try {
      const payload = await preparePrompt(step);
      if (!payload) {
        return;
      }

      const copied = await copyText(payload);

      if (copied) {
        setNotice(`Prompt ${step.title.toLowerCase()} copié.`);
      } else {
        setPromptFallback({ stepKey: step.key, title: step.title, payload });
        setNotice("Prompt prêt dans l'étape concernée.");
      }
    } catch (copyError) {
      setAiError(
        copyError instanceof Error
          ? copyError.message
          : "Impossible de préparer ce prompt.",
      );
    }
  }

  async function handleCopySourceContent(step: StepDefinition) {
    if (!step.sourceArtifactType || !data) {
      return;
    }

    setNotice(null);
    setAiError(null);

    const sourceArtifact = data.artifacts.find(
      (item) => item.type === step.sourceArtifactType,
    );

    if (!sourceArtifact) {
      setAiError("Le contenu support de cette étape n'est pas encore disponible.");
      return;
    }

    const copied = await copyText(sourceArtifact.contenu);
    setNotice(
      copied
        ? "Contenu support copié."
        : "La copie automatique est bloquée sur ce navigateur.",
    );
  }

  async function buildStepPrompt(step: StepDefinition) {
    if (!data) {
      return "";
    }

    return buildPromptPayload({
      context: {
        professor: data.professor,
        module: data.module,
        course: data.course,
      },
      artifacts: data.artifacts,
      etape: step.promptStep,
      sourceArtifactType: step.sourceArtifactType,
    });
  }

  async function handleGenerateAi(step: StepDefinition) {
    const selectedModel = getSelectedAiModel(step);
    if (!data || !selectedModel) {
      return;
    }

    setQueueingStep(step.key);
    setNotice(null);
    setAiError(null);

    try {
      const prompt = await buildStepPrompt(step);

      await queueAiGeneration({
        provider: selectedModel.provider,
        model: selectedModel.model,
        prompt,
        reasoningEffort: step.reasoningEffort,
        task: step.key,
        courseId: data.course.id,
        courseTitle: data.course.titre || "Cours " + data.course.numero,
        stepTitle: step.title,
      });
      setNotice(
        step.title +
          " ajoutée à la file avec " +
          selectedModel.label +
          ". Tu peux naviguer librement ou fermer l'app.",
      );
    } catch (generationError) {
      setAiError(
        generationError instanceof Error
          ? generationError.message
          : "La génération IA a échoué. Vérifie la clé API, le quota ou le modèle choisi.",
      );
    } finally {
      setQueueingStep(null);
    }
  }
  async function runAudioTranscription(audioParts: CourseAudioPart[]) {
    setAudioBusy("transcribe");
    setAudioProgress({ current: 0, total: audioParts.length });
    const transcribedParts: string[] = [];

    for (const [index, part] of audioParts.entries()) {
      setAudioProgress({ current: index + 1, total: audioParts.length });
      const transcription = await transcribeWithAi({
        audioUrl: part.url,
        storagePath: part.storagePath,
      });
      transcribedParts.push(transcription.text);
      setResults((current) => ({
        ...current,
        transcription: transcribedParts.join("\n\n"),
      }));
    }

    setNotice(
      `${audioParts.length} partie${audioParts.length > 1 ? "s" : ""} transcrite${audioParts.length > 1 ? "s" : ""} avec Whisper Large V3. Relis puis enregistre.`,
    );
  }

  async function handleUploadAndTranscribe() {
    if (!data || audioFiles.length === 0) {
      return;
    }

    setNotice(null);
    setAiError(null);
    setAudioBusy("upload");

    try {
      audioFiles.forEach(validateAudioFile);
      const audioParts = await saveCourseAudioParts({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        files: audioFiles,
      });
      setAudioFiles([]);
      setReloadKey((key) => key + 1);
      await runAudioTranscription(audioParts);
    } catch (reason) {
      setAiError(
        reason instanceof Error
          ? reason.message
          : "Impossible d'importer ou de transcrire cet audio.",
      );
    } finally {
      setAudioBusy(null);
      setAudioProgress({ current: 0, total: 0 });
    }
  }

  async function handleTranscribeStoredAudio() {
    if (!data || data.course.audioParts.length === 0) {
      setAiError("Dépose d'abord une ou plusieurs parties audio.");
      return;
    }

    setNotice(null);
    setAiError(null);
    try {
      await runAudioTranscription(data.course.audioParts);
    } catch (reason) {
      setAiError(
        reason instanceof Error
          ? reason.message
          : "La transcription audio a échoué.",
      );
    } finally {
      setAudioBusy(null);
      setAudioProgress({ current: 0, total: 0 });
    }
  }

  async function handleMoveAudioPart(index: number, direction: -1 | 1) {
    if (!data) {
      return;
    }

    const target = index + direction;
    if (target < 0 || target >= data.course.audioParts.length) {
      return;
    }

    const reordered = [...data.course.audioParts];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setAudioBusy("upload");
    try {
      await saveCourseAudioPartsOrder({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        audioParts: reordered,
      });
      setReloadKey((key) => key + 1);
    } finally {
      setAudioBusy(null);
    }
  }

  async function handleDeleteAudioPart(part: CourseAudioPart) {
    if (!data || !window.confirm(`Supprimer « ${part.nom} » ?`)) {
      return;
    }

    setAudioBusy("upload");
    setAiError(null);
    try {
      await deleteCourseAudioPart({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        part,
        remainingParts: data.course.audioParts.filter((item) => item.id !== part.id),
      });
      setReloadKey((key) => key + 1);
      setNotice("Partie audio supprimée.");
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : "Suppression impossible.");
    } finally {
      setAudioBusy(null);
    }
  }

  async function harvestStepOutput(step: StepDefinition, output: string) {
    if (!data) {
      return { messages: [], referencesCount: 0 };
    }

    const messages: string[] = [];
    let referencesCount = 0;

    if (step.key === "correction") {
      const terms = parseNewTerms(output);
      if (terms.length > 0) {
        await upsertVocabularyTerms({
          professorId: data.professor.id,
          moduleId: data.module.id,
          moduleSlug: data.module.slug,
          courseId: data.course.id,
          courseNumero: data.course.numero,
          courseDate: data.course.date,
          terms,
        });
        messages.push(`${terms.length} terme${terms.length > 1 ? "s" : ""}`);
      }
    }

    if (step.key === "synthese") {
      const title = parseShortTitle(output);
      const terms = parseGlossaryTerms(output);

      if (title) {
        await updateCourseTitle({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          titre: title,
        });
        messages.push("titre proposé");
      }

      if (terms.length > 0) {
        await upsertVocabularyTerms({
          professorId: data.professor.id,
          moduleId: data.module.id,
          moduleSlug: data.module.slug,
          courseId: data.course.id,
          courseNumero: data.course.numero,
          courseDate: data.course.date,
          terms,
        });
        messages.push(`${terms.length} terme${terms.length > 1 ? "s" : ""}`);
      }
    }

    if (step.key === "sources") {
      const references = parseReferences(output);
      if (references.length > 0) {
        await saveDetectedReferences({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          references,
        });
        referencesCount = references.length;
        messages.push(
          `${references.length} référence${references.length > 1 ? "s" : ""}`,
        );
      }
    }

    return { messages, referencesCount };
  }

  async function handleSaveResult(step: StepDefinition) {
    if (!data) {
      return;
    }

    setBusyStep(step.key);
    setNotice(null);

    try {
      const output = results[step.key];
      if (step.resultArtifactType) {
        await saveArtifact({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          type: step.resultArtifactType,
          contenu: output,
        });
      } else {
        await markStepDone({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          step: step.key,
        });
      }

      const harvested = await harvestStepOutput(step, output);
      setResults((current) => ({ ...current, [step.key]: "" }));
      setReloadKey((key) => key + 1);
      setNotice(
        harvested.messages.length > 0
          ? `${step.title} enregistrée · récupéré : ${harvested.messages.join(
              ", ",
            )}.`
          : `${step.title} enregistrée.`,
      );

      if (step.key === "sources" && harvested.referencesCount > 0) {
        navigate(`/cours/${data.course.id}/sources`);
      }
    } finally {
      setBusyStep(null);
    }
  }

  async function handleRestart(step: StepKey) {
    if (!data) {
      return;
    }

    const stepTitle = steps.find((item) => item.key === step)?.title ?? "cette étape";
    const confirmed = window.confirm(
      `Relancer ${stepTitle.toLowerCase()} ? Les étapes qui dépendent de ce contenu seront marquées obsolètes, mais leurs contenus resteront lisibles.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyStep(step);
    try {
      await restartStep({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        step,
      });
      setReloadKey((key) => key + 1);
    } finally {
      setBusyStep(null);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement du traitement...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir le traitement."}</p>
      </div>
    );
  }

  const active = currentStep(data.course);
  const progressPercent = Math.round((progress.done / progress.total) * 100);

  return (
    <section className="stack treatment-wrap">
      <header className="treatment-hero">
        <div className="treatment-hero__copy">
          <Link className="treatment-back" to={`/cours/${data.course.id}`}>
            ← Retour au cours
          </Link>
          <span className="eyebrow">Traitement du cours</span>
          <h1 className="page-title">
            {data.course.titre || `Cours ${data.course.numero}`}
          </h1>
          <p className="lede">
            {data.module.nom} · {data.professor.nom}
          </p>
        </div>
        <div className="treatment-hero__meter" aria-label="Progression du workflow">
          <span>{progress.done}/{progress.total}</span>
          <strong>{progressPercent}%</strong>
          <small>
            {active ? `Prochaine étape : ${active.title}` : "Workflow terminé"}
          </small>
        </div>
        <div className="rail" aria-hidden="true">
          {steps.map((step) => (
            <i
              className={
                data.course.etapes[step.key].fait
                  ? "done"
                  : active?.key === step.key
                    ? "now"
                    : undefined
              }
              key={step.key}
              title={step.title}
            />
          ))}
        </div>
        {data.course.audioUrl ? (
          <a
            className="audio-link"
            href={data.course.audioUrl}
            rel="noreferrer"
            target="_blank"
          >
            Ouvrir l'audio stocké
          </a>
        ) : null}
      </header>

      <p className="cloud-sync-state" aria-live="polite">
        {draftStatus === "loading"
          ? "Récupération du brouillon..."
          : draftStatus === "saving"
            ? "Synchronisation..."
            : draftStatus === "error"
              ? "Synchronisation indisponible"
            : "Brouillon synchronisé"}
      </p>

      {notice ? (
        <div aria-live="polite" className="empty-state notice-state">
          {notice}
        </div>
      ) : null}
      {aiError ? (
        <div className="empty-state empty-state--alert notice-state" role="alert">
          {aiError}
        </div>
      ) : null}
      <div className="treatment-steps">
        {steps.map((step, index) => {
          const state = data.course.etapes[step.key];
          const unlocked = isUnlocked(data.course, step);
          const isActive = active?.key === step.key;
          const directCorrection =
            step.key === "correction" && !state.fait && !data.course.etapes.transcription.fait;
          const showBody = (isActive || state.obsolete || directCorrection) && unlocked;
          const artifact = step.resultArtifactType
            ? data.artifacts.find((item) => item.type === step.resultArtifactType)
            : null;
          const sourceArtifact = step.sourceArtifactType
            ? data.artifacts.find((item) => item.type === step.sourceArtifactType)
            : null;
          const selectedModel = getSelectedAiModel(step);
          const canPrepareStep = !state.fait;

          return (
            <article
              className={[
                "treatment-step",
                state.fait ? "done" : "",
                isActive ? "now" : "",
                !unlocked ? "locked" : "",
                state.obsolete ? "obsolete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              key={step.key}
            >
              <div className="step-head">
                <span className="step-num">{state.fait ? "✓" : index + 1}</span>
                <span className="step-head__copy">
                  <em>Étape {index + 1}</em>
                  <strong>{step.title}</strong>
                  <small>
                    {state.fait
                      ? `Fait ${formatDate(state.date)}`
                      : unlocked
                        ? step.description
                        : `Après ${
                            steps.find((item) => item.key === step.unlocksAfter)
                              ?.title
                          }`}
                  </small>
                </span>
                <b className="step-status">
                  {state.obsolete
                    ? "Obsolète"
                    : state.fait
                      ? "Fait"
                      : unlocked
                        ? "À faire"
                        : "Verrouillé"}
                </b>
              </div>

              {state.fait && !state.obsolete ? (
                <div className="step-complete-actions">
                  {artifact ? (
                    <Link className="text-link" to={`/cours/${data.course.id}/${artifact.type}`}>
                      Voir le résultat
                    </Link>
                  ) : null}
                  {step.key === "sources" ? (
                    <Link className="text-link" to={`/cours/${data.course.id}/sources`}>
                      Valider les sources
                    </Link>
                  ) : null}
                  <button
                    className="text-link text-link--button"
                    disabled={busyStep === step.key}
                    onClick={() => handleRestart(step.key)}
                    type="button"
                  >
                    {busyStep === step.key ? "Relance…" : "Relancer"}
                  </button>
                </div>
              ) : null}

              {showBody ? (
                <div className="step-body">
                  <span className="dest-pill">{step.destination}</span>
                  <p>{step.description}</p>
                  <div className="step-support">
                    <strong>Support à joindre</strong>
                    <span>{step.supportHint}</span>
                  </div>
                  {step.key === "transcription" && canPrepareStep ? (
                    <div className="transcription-audio">
                      <label className="audio-drop">
                        <input
                          accept=".m4a,.mp3,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav"
                          disabled={audioBusy !== null}
                          onChange={(event) => {
                            const files = Array.from(event.target.files ?? []);
                            setAiError(null);

                            if (files.length === 0) {
                              setAudioFiles([]);
                              return;
                            }

                            try {
                              files.forEach(validateAudioFile);
                              setAudioFiles(files);
                            } catch (reason) {
                              event.target.value = "";
                              setAudioFiles([]);
                              setAiError(
                                reason instanceof Error
                                  ? reason.message
                                  : "Fichier audio invalide.",
                              );
                            }
                          }}
                          multiple
                          type="file"
                        />
                        <span className="audio-drop__icon" aria-hidden="true">
                          ♪
                        </span>
                        <span>
                          <strong>
                            {audioFiles.length > 0
                              ? `${audioFiles.length} nouvelle${audioFiles.length > 1 ? "s" : ""} partie${audioFiles.length > 1 ? "s" : ""}`
                              : data.course.audioParts.length > 0
                                ? "Ajouter d'autres parties"
                                : "Choisir une ou plusieurs parties"}
                          </strong>
                          <small>Ordre de sélection conservé · 25 Mo maximum par partie</small>
                        </span>
                      </label>

                      {data.course.audioParts.length > 0 ? (
                        <ol className="audio-parts" aria-label="Parties audio du cours">
                          {data.course.audioParts.map((part, partIndex) => (
                            <li className="audio-part" key={part.id}>
                              <div className="audio-part__head">
                                <span className="audio-part__number">
                                  {partIndex + 1}
                                </span>
                                <strong>{part.nom}</strong>
                                <div className="audio-part__tools">
                                  <button
                                    aria-label={`Monter ${part.nom}`}
                                    className="icon-tool"
                                    disabled={audioBusy !== null || partIndex === 0}
                                    onClick={() => handleMoveAudioPart(partIndex, -1)}
                                    title="Monter"
                                    type="button"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    aria-label={`Descendre ${part.nom}`}
                                    className="icon-tool"
                                    disabled={
                                      audioBusy !== null ||
                                      partIndex === data.course.audioParts.length - 1
                                    }
                                    onClick={() => handleMoveAudioPart(partIndex, 1)}
                                    title="Descendre"
                                    type="button"
                                  >
                                    ↓
                                  </button>
                                  <button
                                    aria-label={`Supprimer ${part.nom}`}
                                    className="icon-tool icon-tool--danger"
                                    disabled={audioBusy !== null}
                                    onClick={() => handleDeleteAudioPart(part)}
                                    title="Supprimer"
                                    type="button"
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                              <audio
                                className="transcription-audio__player"
                                controls
                                preload="metadata"
                                src={part.url}
                              />
                            </li>
                          ))}
                        </ol>
                      ) : null}

                      <div className="transcription-audio__actions">
                        {audioFiles.length > 0 ? (
                          <button
                            className="button button--primary"
                            disabled={audioBusy !== null}
                            onClick={handleUploadAndTranscribe}
                            type="button"
                          >
                            {audioBusy === "upload"
                              ? "Import de l'audio..."
                              : audioBusy === "transcribe"
                                ? "Transcription en cours..."
                                : "Importer et transcrire"}
                          </button>
                        ) : data.course.audioParts.length > 0 ? (
                          <button
                            className="button button--primary"
                            disabled={audioBusy !== null}
                            onClick={handleTranscribeStoredAudio}
                            type="button"
                          >
                            {audioBusy === "transcribe"
                              ? `Transcription ${audioProgress.current}/${audioProgress.total}...`
                              : "Transcrire toutes les parties"}
                          </button>
                        ) : null}
                      </div>
                      {audioBusy === "transcribe" ? (
                        <p className="audio-operation" aria-live="polite">
                          Whisper transcrit la partie {audioProgress.current} sur {audioProgress.total}.
                          Garde cette page ouverte jusqu'à la fin.
                        </p>
                      ) : null}
                      {aiError ? (
                        <p className="form-error audio-operation" role="alert">
                          {aiError}
                        </p>
                      ) : null}
                      <p className="transcription-audio__note">
                        Les parties sont transcrites dans cet ordre et assemblées en un texte continu.
                      </p>
                    </div>
                  ) : null}
                  {step.recommendedModelId && canPrepareStep ? (
                    <div
                      aria-label={`Modèle IA pour ${step.title}`}
                      className="ai-model-picker"
                    >
                      {aiModelOptions.map((option) => {
                        const selected = selectedModel?.id === option.id;
                        const recommended = option.id === step.recommendedModelId;

                        return (
                          <button
                            aria-pressed={selected}
                            className={[
                              "ai-model-card",
                              selected ? "ai-model-card--selected" : "",
                            ]
                              .filter(Boolean)
                              .join(" ")}
                            key={option.id}
                            onClick={() =>
                              setSelectedAiModels((current) => ({
                                ...current,
                                [step.key]: option.id,
                              }))
                            }
                            type="button"
                          >
                            <strong>{option.label}</strong>
                            <span>{option.tone}</span>
                            {recommended ? <em>Recommandé</em> : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                  <div className="step-actions">
                    {canPrepareStep && step.key !== "transcription" ? (
                      <button
                        className="tool"
                        onClick={() => handleCopyPrompt(step)}
                        type="button"
                      >
                        Copier le prompt
                      </button>
                    ) : null}
                    {sourceArtifact && canPrepareStep ? (
                      <button
                        className="tool"
                        onClick={() => handleCopySourceContent(step)}
                        type="button"
                      >
                        Copier le support
                      </button>
                    ) : null}
                    {canPrepareStep && step.key !== "transcription" ? (
                      <button
                        className="tool"
                        onClick={() => handleShowPrompt(step)}
                        type="button"
                      >
                        Afficher le prompt
                      </button>
                    ) : null}
                    {selectedModel && canPrepareStep ? (
                      <button
                        className="tool on"
                        disabled={isStepGenerating(step.key)}
                        onClick={() => handleGenerateAi(step)}
                        type="button"
                      >
                        {isStepGenerating(step.key)
                          ? "Génération..."
                          : "Lancer la génération"}
                      </button>
                    ) : null}
                    {step.resultArtifactType ? (
                      <Link
                        className="tool"
                        to={`/cours/${data.course.id}/${step.resultArtifactType}/edit`}
                      >
                        {artifact ? "Modifier" : "Saisir manuellement"}
                      </Link>
                    ) : null}
                    {step.key === "image" ? (
                      <Link
                        className="tool"
                        to={`/cours/${data.course.id}/images/new`}
                      >
                        Déposer l'image
                      </Link>
                    ) : null}
                  </div>
                  {isStepGenerating(step.key) ? (
                    <p className="audio-operation" aria-live="polite">
                      {activeJobFor(step.key)?.status === "queued"
                        ? "En attente de traitement. Tu peux naviguer librement ou fermer l'app."
                        : "Traitement en arrière-plan. Tu peux naviguer librement ou fermer l'app."}
                    </p>
                  ) : null}
                  {aiError && step.key !== "transcription" ? (
                    <p className="form-error audio-operation" role="alert">
                      {aiError}
                    </p>
                  ) : null}
                  {promptFallback?.stepKey === step.key ? (
                    <div className="prompt-fallback">
                      <div>
                        <strong>
                          Prompt {promptFallback.title.toLowerCase()} prêt
                        </strong>
                        <span>Utilise ce bouton si la copie directe bloque.</span>
                      </div>
                      <button
                        className="tool"
                        onClick={async () => {
                          const copied = await copyText(promptFallback.payload);
                          setNotice(
                            copied
                              ? "Prompt copié."
                              : "La copie automatique est bloquée sur ce navigateur.",
                          );
                        }}
                        type="button"
                      >
                        Copier
                      </button>
                    </div>
                  ) : null}

                  {!state.fait ? (
                    <div className="pipeline-paste">
                      <textarea
                        onChange={(event) =>
                          setResults((current) => ({
                            ...current,
                            [step.key]: event.target.value,
                          }))
                        }
                        placeholder={pastePlaceholder(step)}
                        value={results[step.key]}
                      />
                      <button
                        className="button button--primary"
                        disabled={
                          busyStep === step.key ||
                          Boolean(
                            (step.resultArtifactType || step.key === "sources") &&
                              !results[step.key].trim(),
                          )
                        }
                        onClick={() => handleSaveResult(step)}
                        type="button"
                      >
                        {busyStep === step.key ? "Enregistrement..." : saveLabel(step)}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <Link className="todo-link" to={`/cours/${data.course.id}`}>
        Retour au cours
      </Link>
    </section>
  );
}
