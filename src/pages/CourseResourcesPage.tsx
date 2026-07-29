import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  getCourseImagesByPath,
  listCourseReferences,
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

function buildChecklist(input: {
  artifacts: Artifact[];
  images: CourseImage[];
  course: { id: string; titreValide: boolean; etapes: Record<StepKey, { fait: boolean; obsolete: boolean }> };
  references: Awaited<ReturnType<typeof listCourseReferences>>;
}) {
  const items: Array<{
    label: string;
    detail: string;
    href: string;
    done: boolean;
  }> = [
    {
      label: "Transcription corrigée",
      detail: "Base de tout le workflow",
      href: `/cours/${input.course.id}/traitement`,
      done: hasArtifact(input.artifacts, "transcription_corrigee"),
    },
    {
      label: "Synthèse lisible",
      detail: "Document principal du cours",
      href: `/cours/${input.course.id}/traitement`,
      done: hasArtifact(input.artifacts, "synthese") && !input.course.etapes.synthese.obsolete,
    },
    {
      label: "Sources validées",
      detail: "Texte et source tranchés humainement",
      href: `/cours/${input.course.id}/sources`,
      done:
        input.references.length > 0 &&
        input.references.every((reference) => reference.valide),
    },
    {
      label: "Fiche de révision",
      detail: "Support court de mémorisation",
      href: `/cours/${input.course.id}/traitement`,
      done: hasArtifact(input.artifacts, "fiche") && !input.course.etapes.fiche.obsolete,
    },
    {
      label: "Image conforme",
      detail: "Fiche image déposée et contrôlée",
      href:
        input.images[0] ? `/images/${input.course.id}/${input.images[0].id}` : `/cours/${input.course.id}/images/new`,
      done: input.images.some(
        (image) => image.verification.faite && image.verification.conforme,
      ),
    },
    {
      label: "Titre confirmé",
      detail: "Nom propre pour l’archive",
      href: `/cours/${input.course.id}/synthese`,
      done: input.course.titreValide,
    },
  ];

  return items;
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

    const [artifacts, images, references] = await Promise.all([
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
      listCourseReferences({
        professorId: context.professor.id,
        moduleId: context.module.id,
        courseId: context.course.id,
      }),
    ]);

    return { ...context, artifacts, images, references };
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
  const checklist = useMemo(() => {
    if (!data) {
      return [];
    }

    return buildChecklist({
      artifacts: data.artifacts,
      images: data.images,
      course: data.course,
      references: data.references,
    });
  }, [data]);
  const todoCount = checklist.filter((item) => !item.done).length;

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

      <div className="resource-smart-card">
        <div className="resource-section-title">
          <span className="resource-section-title__icon">✓</span>
          <div>
            <h2>Checklist du cours</h2>
            <p>
              {todoCount === 0
                ? "Tout est prêt pour relire le cours complet."
                : `${todoCount} point${todoCount > 1 ? "s" : ""} à terminer.`}
            </p>
          </div>
          <em>{todoCount}</em>
        </div>
        <div className="smart-checklist">
          {checklist.map((item) => (
            <Link
              className={item.done ? "smart-check smart-check--done" : "smart-check"}
              key={item.label}
              to={item.href}
            >
              <span>{item.done ? "✓" : "·"}</span>
              <strong>{item.label}</strong>
              <small>{item.detail}</small>
            </Link>
          ))}
        </div>
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
          <Link className="todo-link" to={`/cours/${data.course.id}/complet`}>
            Lire le cours complet
          </Link>
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
