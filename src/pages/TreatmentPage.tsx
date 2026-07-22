import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  restartStep,
} from "../lib/libraryRepository";
import type { ArtifactType, Course, StepKey } from "../types/domain";

type StepDefinition = {
  key: StepKey;
  title: string;
  description: string;
  artifactType?: ArtifactType;
  unlocksAfter?: StepKey;
  destination: string;
};

const steps: StepDefinition[] = [
  {
    key: "transcription",
    title: "Transcription",
    description: "Transcrire l'audio, puis conserver uniquement le texte corrigé.",
    artifactType: "transcription_corrigee",
    destination: "Notebook Gemini",
  },
  {
    key: "correction",
    title: "Correction",
    description: "Nettoyer les termes et préparer le texte source.",
    unlocksAfter: "transcription",
    destination: "Claude",
  },
  {
    key: "synthese",
    title: "Synthèse",
    description: "Structurer le cours en document lisible.",
    artifactType: "synthese",
    unlocksAfter: "correction",
    destination: "Claude",
  },
  {
    key: "sources",
    title: "Sources",
    description: "Identifier les références citées.",
    unlocksAfter: "synthese",
    destination: "Claude",
  },
  {
    key: "fiche",
    title: "Fiche de révision",
    description: "Condenser l'essentiel en une page mémorisable.",
    artifactType: "fiche",
    unlocksAfter: "sources",
    destination: "Claude",
  },
  {
    key: "image",
    title: "Fiche image",
    description: "Générer le prompt, déposer l'image, puis vérifier.",
    artifactType: "prompt_image",
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

      <div className="treatment-steps">
        {steps.map((step, index) => {
          const state = data.course.etapes[step.key];
          const unlocked = isUnlocked(data.course, step);
          const isActive = active?.key === step.key;
          const artifact = step.artifactType
            ? data.artifacts.find((item) => item.type === step.artifactType)
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
                        : `Après ${steps.find((item) => item.key === step.unlocksAfter)?.title}`}
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
                    {artifact ? (
                      <Link
                        className="tool"
                        to={`/cours/${data.course.id}/${artifact.type}`}
                      >
                        Voir le contenu
                      </Link>
                    ) : null}
                    {step.artifactType ? (
                      <Link
                        className="tool"
                        to={`/cours/${data.course.id}/${step.artifactType}/edit`}
                      >
                        {artifact ? "Modifier" : "Saisir le résultat"}
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
