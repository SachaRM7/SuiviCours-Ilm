import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  markStepDone,
  restartStep,
  saveArtifact,
} from "../lib/libraryRepository";
import { buildPromptPayload } from "../lib/promptRepository";
import type {
  ArtifactType,
  Course,
  PromptStep,
  StepKey,
} from "../types/domain";

type StepDefinition = {
  key: StepKey;
  promptStep: PromptStep;
  title: string;
  description: string;
  resultArtifactType?: ArtifactType;
  sourceArtifactType?: ArtifactType;
  unlocksAfter?: StepKey;
  destination: string;
};

const steps: StepDefinition[] = [
  {
    key: "transcription",
    promptStep: "transcription",
    title: "Transcription",
    description: "Transcrire l'audio dans Notebook Gemini.",
    destination: "Notebook Gemini",
  },
  {
    key: "correction",
    promptStep: "correction",
    title: "Correction",
    description: "Nettoyer les termes et produire la transcription corrigée.",
    resultArtifactType: "transcription_corrigee",
    unlocksAfter: "transcription",
    destination: "Claude",
  },
  {
    key: "synthese",
    promptStep: "synthese",
    title: "Synthèse",
    description: "Structurer le cours en document lisible.",
    resultArtifactType: "synthese",
    sourceArtifactType: "transcription_corrigee",
    unlocksAfter: "correction",
    destination: "Claude",
  },
  {
    key: "sources",
    promptStep: "sources",
    title: "Sources",
    description: "Identifier les références citées.",
    sourceArtifactType: "synthese",
    unlocksAfter: "synthese",
    destination: "Claude",
  },
  {
    key: "fiche",
    promptStep: "fiche",
    title: "Fiche de révision",
    description: "Condenser l'essentiel en une page mémorisable.",
    resultArtifactType: "fiche",
    sourceArtifactType: "synthese",
    unlocksAfter: "sources",
    destination: "Claude",
  },
  {
    key: "image",
    promptStep: "prompt_image",
    title: "Fiche image",
    description: "Générer le prompt, déposer l'image, puis vérifier.",
    resultArtifactType: "prompt_image",
    sourceArtifactType: "synthese",
    unlocksAfter: "sources",
    destination: "GPT Image",
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

export function TreatmentPage() {
  const { courseId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [busyStep, setBusyStep] = useState<StepKey | null>(null);
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

  async function handleCopyPrompt(step: StepDefinition) {
    if (!data) {
      return;
    }

    setNotice(null);
    const payload = await buildPromptPayload({
      context: {
        professor: data.professor,
        module: data.module,
        course: data.course,
      },
      artifacts: data.artifacts,
      etape: step.promptStep,
      sourceArtifactType: step.sourceArtifactType,
    });
    await navigator.clipboard.writeText(payload);
    setNotice(`Prompt ${step.title.toLowerCase()} copié.`);
  }

  async function handleSaveResult(step: StepDefinition) {
    if (!data) {
      return;
    }

    setBusyStep(step.key);
    setNotice(null);

    try {
      if (step.resultArtifactType) {
        await saveArtifact({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          type: step.resultArtifactType,
          contenu: results[step.key],
        });
      } else {
        await markStepDone({
          professorId: data.professor.id,
          moduleId: data.module.id,
          courseId: data.course.id,
          step: step.key,
        });
      }

      setResults((current) => ({ ...current, [step.key]: "" }));
      setReloadKey((key) => key + 1);
      setNotice(`${step.title} enregistrée.`);
    } finally {
      setBusyStep(null);
    }
  }

  async function handleRestart(step: StepKey) {
    if (!data) {
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
      </header>

      {notice ? <div className="empty-state notice-state">{notice}</div> : null}

      <div className="treatment-steps">
        {steps.map((step, index) => {
          const state = data.course.etapes[step.key];
          const unlocked = isUnlocked(data.course, step);
          const isActive = active?.key === step.key;
          const artifact = step.resultArtifactType
            ? data.artifacts.find((item) => item.type === step.resultArtifactType)
            : null;

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

              {(isActive || state.fait || state.obsolete) && unlocked ? (
                <div className="step-body">
                  <span className="dest-pill">{step.destination}</span>
                  <p>{step.description}</p>
                  <div className="step-actions">
                    <button
                      className="tool"
                      onClick={() => handleCopyPrompt(step)}
                      type="button"
                    >
                      Copier le prompt
                    </button>
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
                        placeholder={
                          step.resultArtifactType
                            ? "Colle ici le résultat produit..."
                            : "Aucun artefact n'est conservé pour cette étape. Tu peux laisser vide et marquer fait."
                        }
                        value={results[step.key]}
                      />
                      <button
                        className="button button--primary"
                        disabled={
                          busyStep === step.key ||
                          Boolean(step.resultArtifactType && !results[step.key].trim())
                        }
                        onClick={() => handleSaveResult(step)}
                        type="button"
                      >
                        {busyStep === step.key ? "Enregistrement..." : "Enregistrer"}
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
