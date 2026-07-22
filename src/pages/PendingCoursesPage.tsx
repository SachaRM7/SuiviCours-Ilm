import { useCallback, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { getModuleExportData } from "../lib/libraryRepository";
import type { Course, StepKey } from "../types/domain";

const stepLabels: Record<StepKey, string> = {
  transcription: "transcription",
  correction: "correction",
  synthese: "synthèse",
  sources: "sources",
  fiche: "fiche",
  image: "image",
};

const stepOrder: StepKey[] = [
  "transcription",
  "correction",
  "synthese",
  "sources",
  "fiche",
  "image",
];

function pendingLabels(course: Course) {
  return stepOrder
    .filter((step) => !course.etapes[step].fait || course.etapes[step].obsolete)
    .map((step) =>
      course.etapes[step].obsolete
        ? `${stepLabels[step]} obsolète`
        : stepLabels[step],
    );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function PendingCoursesPage() {
  const { moduleId } = useParams();
  const load = useCallback(
    () => (moduleId ? getModuleExportData(moduleId) : Promise.resolve(null)),
    [moduleId],
  );
  const { data, error, loading } = useAsync(load);
  const pending = useMemo(
    () =>
      (data?.courses ?? [])
        .map((item) => ({
          course: item.course,
          pending: pendingLabels(item.course),
        }))
        .filter((item) => item.pending.length > 0)
        .sort((left, right) => right.course.numero - left.course.numero),
    [data?.courses],
  );

  if (loading) {
    return <div className="empty-state">Chargement des cours à terminer...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Lecture impossible</h2>
        <p>{error ?? "Impossible d'ouvrir ce module."}</p>
      </div>
    );
  }

  return (
    <section className="stack">
      <div>
        <p className="eyebrow">À terminer</p>
        <h1 className="page-title">{data.module.nom}</h1>
        <p className="lede">
          {pending.length} cours avec une étape manquante ou obsolète.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="empty-state">
          <h2>Tout est à jour</h2>
          <p>Aucun cours de ce module n'attend d'action.</p>
        </div>
      ) : (
        <div className="docs">
          {pending.map(({ course, pending: labels }) => (
            <Link
              className="doc-row doc-row--pending"
              key={course.id}
              to={`/cours/${course.id}/traitement`}
            >
              <span className="doc-row__number">{course.numero}</span>
              <span>
                <strong>{course.titre || `Cours ${course.numero}`}</strong>
                <small>{formatDate(course.date)}</small>
                <em>{labels.join(" · ")}</em>
              </span>
              <span className="doc-row__action">Traiter</span>
            </Link>
          ))}
        </div>
      )}

      <Link className="todo-link" to={`/modules/${data.module.id}`}>
        Retour au module
      </Link>
    </section>
  );
}
