import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { generateWithAi } from "../lib/aiRepository";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  markStepDone,
  restartStep,
  saveArtifact,
  saveDetectedReferences,
  updateCourseTitle,
  upsertVocabularyTerms,
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
  PromptStep,
  StepKey,
} from "../types/domain";
import type { AiProvider } from "../lib/aiRepository";

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
};

type AiModelId = "luna" | "sonnet" | "opus";

type AiModelOption = {
  id: AiModelId;
  label: string;
  provider: AiProvider;
  model: string;
  tone: string;
};

type PromptFallback = {
  title: string;
  payload: string;
};

const aiModelOptions: AiModelOption[] = [
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
    description:
      "Transcrire l'audio dans Notebook Gemini, ou marquer fait si tu as déjà la transcription corrigée.",
    supportHint: "À joindre dans Notebook Gemini : le fichier audio du cours.",
    destination: "Notebook Gemini",
  },
  {
    key: "correction",
    promptStep: "correction",
    title: "Correction",
    description: "Nettoyer les termes et produire la transcription corrigée.",
    supportHint:
      "À joindre au prompt : la transcription brute produite par Notebook Gemini.",
    resultArtifactType: "transcription_corrigee",
    destination: "IA",
    recommendedModelId: "luna",
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
    recommendedModelId: "sonnet",
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
    recommendedModelId: "sonnet",
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
    recommendedModelId: "luna",
  },
  {
    key: "image",
    promptStep: "prompt_image",
    title: "Fiche image",
    description: "Générer le prompt, déposer l'image, puis vérifier.",
    supportHint: "À joindre au prompt : la synthèse et les sources validées.",
    resultArtifactType: "prompt_image",
    sourceArtifactType: "synthese",
    unlocksAfter: "sources",
    destination: "IA",
    recommendedModelId: "luna",
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
  const [aiStep, setAiStep] = useState<StepKey | null>(null);
  const [selectedAiModels, setSelectedAiModels] = useState<
    Partial<Record<StepKey, AiModelId>>
  >({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [promptFallback, setPromptFallback] = useState<PromptFallback | null>(
    null,
  );
  const [results, setResults] = useState<Record<StepKey, string>>({
    transcription: "",
    correction: "",
    synthese: "",
    sources: "",
    fiche: "",
    image: "",
  });
  const [notice, setNotice] = useState<string | null>(null);
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

      setPromptFallback({ title: step.title, payload });
      setNotice("Prompt affiché ci-dessous.");
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
        setPromptFallback({ title: step.title, payload });
        setNotice("Prompt prêt. Copie-le depuis le bloc affiché ci-dessous.");
      }
    } catch (copyError) {
      setAiError(
        copyError instanceof Error
          ? copyError.message
          : "Impossible de préparer ce prompt.",
      );
    }
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

    setAiStep(step.key);
    setNotice(null);
    setAiError(null);

    try {
      const prompt = await buildStepPrompt(step);

      const result = await generateWithAi({
        provider: selectedModel.provider,
        model: selectedModel.model,
        prompt,
      });
      setResults((current) => ({ ...current, [step.key]: result.text }));
      setNotice(
        `${step.title} générée avec ${selectedModel.label}. Relis puis enregistre.`,
      );
    } catch (generationError) {
      setAiError(
        generationError instanceof Error
          ? generationError.message
          : "La génération IA a échoué. Vérifie la clé API, le quota ou le modèle choisi.",
      );
    } finally {
      setAiStep(null);
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

  return (
    <section className="stack treatment-wrap">
      <header>
        <h1 className="page-title">
          {data.course.titre || `Cours ${data.course.numero}`}
        </h1>
        <p className="lede">
          {data.module.nom} · {data.professor.nom} · {progress.done} étape
          {progress.done > 1 ? "s" : ""} sur {progress.total}
        </p>
        <div className="rail">
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
      {promptFallback ? (
        <div className="prompt-fallback">
          <div className="prompt-fallback__head">
            <div>
              <strong>Prompt {promptFallback.title.toLowerCase()} prêt</strong>
              <span>Si la copie automatique bloque, copie ce contenu.</span>
            </div>
            <button
              className="tool"
              onClick={async () => {
                const copied = await copyText(promptFallback.payload);
                setNotice(
                  copied
                    ? "Prompt copié."
                    : "Sélectionne le texte puis copie-le manuellement.",
                );
              }}
              type="button"
            >
              Copier
            </button>
          </div>
          <textarea
            onFocus={(event) => event.target.select()}
            readOnly
            value={promptFallback.payload}
          />
        </div>
      ) : null}

      <div className="treatment-steps">
        {steps.map((step, index) => {
          const state = data.course.etapes[step.key];
          const unlocked = isUnlocked(data.course, step);
          const isActive = active?.key === step.key;
          const directCorrection =
            step.key === "correction" && !state.fait && !data.course.etapes.transcription.fait;
          const showBody =
            (isActive || state.fait || state.obsolete || directCorrection) &&
            unlocked;
          const artifact = step.resultArtifactType
            ? data.artifacts.find((item) => item.type === step.resultArtifactType)
            : null;
          const selectedModel = getSelectedAiModel(step);

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
                <span>
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
                <b>
                  {state.obsolete
                    ? "Obsolète"
                    : state.fait
                      ? "Fait"
                      : unlocked
                        ? "À faire"
                        : "Verrouillé"}
                </b>
              </div>

              {showBody ? (
                <div className="step-body">
                  <span className="dest-pill">{step.destination}</span>
                  <p>{step.description}</p>
                  <div className="step-support">
                    <strong>Support à joindre</strong>
                    <span>{step.supportHint}</span>
                  </div>
                  {step.recommendedModelId && !state.fait ? (
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
                    <button
                      className="tool"
                      onClick={() => handleCopyPrompt(step)}
                      type="button"
                    >
                      Copier le prompt
                    </button>
                    <button
                      className="tool"
                      onClick={() => handleShowPrompt(step)}
                      type="button"
                    >
                      Afficher le prompt
                    </button>
                    {selectedModel && !state.fait ? (
                      <button
                        className="tool on"
                        disabled={aiStep === step.key}
                        onClick={() => handleGenerateAi(step)}
                        type="button"
                      >
                        {aiStep === step.key
                          ? "Génération..."
                          : "Lancer la génération"}
                      </button>
                    ) : null}
                    {artifact ? (
                      <Link
                        className="tool"
                        to={`/cours/${data.course.id}/${artifact.type}`}
                      >
                        Voir le contenu
                      </Link>
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
                    {step.key === "sources" && state.fait ? (
                      <Link className="tool" to={`/cours/${data.course.id}/sources`}>
                        Valider les sources
                      </Link>
                    ) : null}
                    {state.fait ? (
                      <button
                        className="tool danger"
                        disabled={busyStep === step.key}
                        onClick={() => handleRestart(step.key)}
                        type="button"
                      >
                        {busyStep === step.key ? "Relance..." : "Relancer l'étape"}
                      </button>
                    ) : null}
                  </div>

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

      <Link className="todo-link" to={`/cours/${data.course.id}/synthese`}>
        Voir le cours
      </Link>
    </section>
  );
}
