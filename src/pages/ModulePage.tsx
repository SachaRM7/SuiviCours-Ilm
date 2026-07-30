import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { exportMetadataSummary, exportModuleAsZip } from "../lib/exportLibrary";
import { getModuleExportData } from "../lib/libraryRepository";
import type { Artifact, Course, CourseImage, StepKey } from "../types/domain";

const stepKeys: StepKey[] = [
  "transcription",
  "correction",
  "synthese",
  "sources",
  "fiche",
  "image",
];

function imageStatus(images: CourseImage[]) {
  const pending = images.filter((image) => !image.verification.faite).length;
  const conformes = images.filter(
    (image) => image.verification.faite && image.verification.conforme,
  ).length;

  if (images.length === 0) return "Aucune fiche image";
  if (conformes > 0) return `${conformes} image${conformes > 1 ? "s" : ""} conforme${conformes > 1 ? "s" : ""}`;
  return `${pending || images.length} image${images.length > 1 ? "s" : ""} à vérifier`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function courseProgress(course: Course) {
  const done = stepKeys.filter(
    (step) => course.etapes[step].fait && !course.etapes[step].obsolete,
  ).length;
  return { done, total: stepKeys.length, complete: done === stepKeys.length };
}

function courseBadges(input: { artifacts: Artifact[]; images: CourseImage[] }) {
  return [
    input.artifacts.some((artifact) => artifact.type === "synthese") ? "Synthèse" : "",
    input.artifacts.some((artifact) => artifact.type === "fiche") ? "Fiche" : "",
    input.images.some((image) => image.verification.faite && image.verification.conforme)
      ? "Image"
      : "",
    input.artifacts.some((artifact) => artifact.type === "transcription_corrigee")
      ? "Transcription"
      : "",
  ].filter(Boolean);
}

export function ModulePage() {
  const { moduleId } = useParams();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const loadModule = useCallback(
    () => (moduleId ? getModuleExportData(moduleId) : Promise.resolve(null)),
    [moduleId],
  );
  const { data, error, loading } = useAsync(loadModule);
  const allImages = useMemo(
    () => (data?.courses ?? []).flatMap((item) => item.images),
    [data?.courses],
  );
  const pendingCount = useMemo(
    () =>
      (data?.courses ?? []).filter((item) =>
        stepKeys.some(
          (step) => !item.course.etapes[step].fait || item.course.etapes[step].obsolete,
        ),
      ).length,
    [data?.courses],
  );

  async function handleExportModule() {
    if (!data) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportModuleAsZip(data);
    } catch (reason) {
      setExportError(reason instanceof Error ? reason.message : "Impossible d'exporter ce module.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <div className="empty-state">Chargement du module…</div>;
  if (error || !data) {
    return <div className="empty-state empty-state--alert"><h2>Module introuvable</h2><p>{error ?? "Impossible d'ouvrir ce module."}</p></div>;
  }

  return (
    <section className="stack module-page">
      <header className="module-page__head">
        <p className="eyebrow">{data.professor.nom}</p>
        <h1 className="page-title">{data.module.nom}</h1>
        <p className="lede">{data.courses.length} cours · {pendingCount} à traiter · {imageStatus(allImages)}</p>
      </header>

      <div className="module-summary">
        <div>
          <p className="eyebrow">Point de reprise</p>
          <h2>{pendingCount > 0 ? `${pendingCount} cours demandent une action` : "Tout est à jour"}</h2>
          <p>{pendingCount > 0 ? "Ouvre un cours pour reprendre exactement à la bonne étape." : "Tes cours sont prêts à lire et à réviser."}</p>
        </div>
        <Link className="todo-link todo-link--dark" to={pendingCount > 0 ? `/modules/${data.module.id}/a-terminer` : "/nouveau-cours"}>
          {pendingCount > 0 ? "Reprendre" : "Ajouter un cours"}
        </Link>
      </div>

      <section className="course-entry">
        <div>
          <p className="eyebrow">Cours</p>
          <h2>Les cours du module</h2>
        </div>
        {data.courses.length > 0 ? (
          <div className="course-entry-list">
            {[...data.courses]
              .sort((left, right) => right.course.numero - left.course.numero)
              .map((item) => {
                const progress = courseProgress(item.course);
                const badges = courseBadges(item);
                return (
                  <Link
                    className={progress.complete ? "course-entry-card course-entry-card--complete" : "course-entry-card"}
                    key={item.course.id}
                    to={`/cours/${item.course.id}`}
                  >
                    <span className="course-entry-card__number">{item.course.numero}</span>
                    <span className="course-entry-card__body">
                      <strong>{item.course.titre || `Cours ${item.course.numero}`}</strong>
                      <small>{formatDate(item.course.date)}</small>
                      {badges.length > 0 ? <span className="course-entry-card__badges">{badges.map((badge) => <em key={badge}>{badge}</em>)}</span> : null}
                    </span>
                    <span className="course-entry-card__status">{progress.complete ? "Lire" : `${progress.done}/${progress.total}`}</span>
                  </Link>
                );
              })}
          </div>
        ) : <div className="empty-state">Aucun cours pour ce module.</div>}
      </section>

      <details className="module-library">
        <summary>Parcourir par type de document</summary>
        <div>
          <Link to={`/modules/${data.module.id}/syntheses`}>Synthèses</Link>
          <Link to={`/modules/${data.module.id}/fiches`}>Fiches de révision</Link>
          <Link to={`/modules/${data.module.id}/images`}>Fiches images</Link>
          <Link to={`/modules/${data.module.id}/transcriptions`}>Transcriptions</Link>
        </div>
      </details>

      <div className="module-actions">
        <Link className="todo-link" to="/nouveau-cours">Ajouter un cours</Link>
        <button className="todo-link todo-link--button" disabled={exporting} onClick={handleExportModule} type="button">
          {exporting ? "Export…" : "Exporter le module"}
        </button>
      </div>
      {exportError ? <div className="empty-state empty-state--alert"><p>{exportError}</p></div> : null}
      <p className="export-hint">Archive ZIP · {exportMetadataSummary(data)}</p>
    </section>
  );
}
