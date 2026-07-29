import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  getCourseImagesByPath,
} from "../lib/libraryRepository";
import type { Artifact, ArtifactType, CourseImage, StepKey } from "../types/domain";

const resources: Array<{
  type: ArtifactType;
  step: StepKey;
  label: string;
  description: string;
  icon: string;
}> = [
  {
    type: "synthese",
    step: "synthese",
    label: "Synthèse",
    description: "Cours complet et structuré",
    icon: "§",
  },
  {
    type: "fiche",
    step: "fiche",
    label: "Fiche de révision",
    description: "L'essentiel à mémoriser",
    icon: "□",
  },
  {
    type: "transcription_corrigee",
    step: "correction",
    label: "Transcription",
    description: "Verbatim corrigé archivé",
    icon: "¶",
  },
  {
    type: "prompt_image",
    step: "image",
    label: "Prompt image",
    description: "Consigne de génération visuelle",
    icon: "✦",
  },
];

const steps: StepKey[] = [
  "transcription",
  "correction",
  "synthese",
  "sources",
  "fiche",
  "image",
];

function hasArtifact(artifacts: Artifact[], type: ArtifactType) {
  return artifacts.some((artifact) => artifact.type === type);
}

function imageStatus(images: CourseImage[]) {
  if (images.length === 0) {
    return "Aucune image déposée";
  }

  const conformes = images.filter(
    (image) => image.verification.faite && image.verification.conforme,
  ).length;
  const pending = images.filter((image) => !image.verification.faite).length;

  if (conformes > 0) {
    return `${conformes} conforme${conformes > 1 ? "s" : ""}`;
  }

  return `${pending || images.length} à vérifier`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function CourseResourcesPage() {
  const { courseId } = useParams();
  const load = useCallback(async () => {
    if (!courseId) {
      return null;
    }

    const context = await getCourseContext(courseId);
    if (!context) {
      return null;
    }

    const [artifacts, images] = await Promise.all([
      getCourseArtifactsByPath(
        context.professor.id,
        context.module.id,
        context.course.id,
      ),
      getCourseImagesByPath(
        context.professor.id,
        context.module.id,
        context.course.id,
      ),
    ]);

    return { ...context, artifacts, images };
  }, [courseId]);
  const { data, error, loading } = useAsync(load);
  const progress = useMemo(() => {
    if (!data) {
      return { done: 0, total: steps.length };
    }

    return {
      done: steps.filter(
        (step) => data.course.etapes[step].fait && !data.course.etapes[step].obsolete,
      ).length,
      total: steps.length,
    };
  }, [data]);

  if (loading) {
    return <div className="empty-state">Chargement des ressources...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir les ressources de ce cours."}</p>
      </div>
    );
  }

  return (
    <section className="course-resources">
      <div className="resource-head">
        <Link className="resource-back" to={`/modules/${data.module.id}`}>
          ‹
        </Link>
        <div>
          <p className="eyebrow">Ressources du cours</p>
          <h1>{data.course.titre || `Cours ${data.course.numero}`}</h1>
          <p>
            {data.module.nom} · Cours {data.course.numero} ·{" "}
            {formatDate(data.course.date)}
          </p>
        </div>
        <Link className="todo-link" to={`/cours/${data.course.id}/traitement`}>
          Traitement
        </Link>
      </div>

      <div className="resource-progress-card">
        <div>
          <strong>
            {progress.done}/{progress.total}
          </strong>
          <span>workflow complété</span>
        </div>
        <i>
          <b style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
        </i>
      </div>

      <div className="resource-section-title">
        <span className="resource-section-title__icon">◉</span>
        <div>
          <h2>Documents du cours</h2>
          <p>Tout ce qui a été produit pour ce cours.</p>
        </div>
        <em>{resources.length + 1}</em>
      </div>

      <div className="resource-list">
        {resources.map((resource) => {
          const exists = hasArtifact(data.artifacts, resource.type);
          const step = data.course.etapes[resource.step];

          return (
            <Link
              className={exists ? "resource-row" : "resource-row resource-row--missing"}
              key={resource.type}
              to={
                exists
                  ? `/cours/${data.course.id}/${resource.type}`
                  : `/cours/${data.course.id}/traitement`
              }
            >
              <span className="resource-row__icon">{resource.icon}</span>
              <span>
                <strong>{resource.label}</strong>
                <small>{resource.description}</small>
              </span>
              <em>
                {exists
                  ? step.obsolete
                    ? "Obsolète"
                    : "Ouvrir"
                  : "À faire"}
              </em>
            </Link>
          );
        })}

        <Link
          className={
            data.images.length > 0 ? "resource-row" : "resource-row resource-row--missing"
          }
          to={
            data.images[0]
              ? `/images/${data.course.id}/${data.images[0].id}`
              : `/cours/${data.course.id}/images/new`
          }
        >
          <span className="resource-row__icon">◫</span>
          <span>
            <strong>Fiches images</strong>
            <small>{imageStatus(data.images)}</small>
          </span>
          <em>{data.images.length > 0 ? "Ouvrir" : "Déposer"}</em>
        </Link>
      </div>

      <div className="resource-secondary">
        <div className="resource-section-title">
          <span className="resource-section-title__icon">◎</span>
          <div>
            <h2>Actions rapides</h2>
            <p>Reprendre le workflow ou ajouter une nouvelle image.</p>
          </div>
        </div>
        <div className="resource-actions">
          <Link className="todo-link" to={`/cours/${data.course.id}/traitement`}>
            Continuer le workflow
          </Link>
          <Link className="todo-link" to={`/cours/${data.course.id}/images/new`}>
            Ajouter une image
          </Link>
        </div>
      </div>
    </section>
  );
}
