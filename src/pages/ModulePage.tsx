import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { exportMetadataSummary, exportModuleAsZip } from "../lib/exportLibrary";
import { getModuleExportData } from "../lib/libraryRepository";
import type { Artifact, ArtifactType, Course, CourseImage, StepKey } from "../types/domain";

type ShelfKey = "syntheses" | "fiches" | "images" | "transcriptions";

const stepKeys: StepKey[] = [
  "transcription",
  "correction",
  "synthese",
  "sources",
  "fiche",
  "image",
];

const shelves: Array<{
  key: ShelfKey;
  title: string;
  description: string;
  artifactType?: ArtifactType;
  archive?: boolean;
}> = [
  {
    key: "syntheses",
    title: "Synthèses",
    description: "Le cours complet, structuré",
    artifactType: "synthese",
  },
  {
    key: "fiches",
    title: "Fiches de révision",
    description: "L'essentiel sur une page",
    artifactType: "fiche",
  },
  {
    key: "images",
    title: "Fiches images",
    description: "À afficher, à mémoriser",
  },
  {
    key: "transcriptions",
    title: "Transcriptions",
    description: "Archive · le verbatim corrigé",
    artifactType: "transcription_corrigee",
    archive: true,
  },
];

function imageStatus(images: CourseImage[]) {
  const total = images.length;
  const pending = images.filter((image) => !image.verification.faite).length;
  const conformes = images.filter(
    (image) => image.verification.faite && image.verification.conforme,
  ).length;
  const corrections = images.filter(
    (image) => image.verification.faite && !image.verification.conforme,
  ).length;

  if (total === 0) {
    return "Aucune fiche image déposée";
  }

  const parts = [
    pending ? `${pending} à vérifier` : "",
    conformes ? `${conformes} conforme${conformes > 1 ? "s" : ""}` : "",
    corrections ? `${corrections} à corriger` : "",
  ].filter(Boolean);

  return parts.join(" · ");
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

  return {
    done,
    total: stepKeys.length,
    complete: done === stepKeys.length,
  };
}

function hasArtifact(artifacts: Artifact[], type: ArtifactType) {
  return artifacts.some((artifact) => artifact.type === type);
}

function courseEntryHref(input: { course: Course; artifacts: Artifact[] }) {
  if (hasArtifact(input.artifacts, "synthese")) {
    return `/cours/${input.course.id}/synthese`;
  }

  return `/cours/${input.course.id}/traitement`;
}

function courseBadges(input: { artifacts: Artifact[]; images: CourseImage[] }) {
  return [
    hasArtifact(input.artifacts, "synthese") ? "Synthèse" : "",
    hasArtifact(input.artifacts, "fiche") ? "Fiche" : "",
    input.images.some((image) => image.verification.faite && image.verification.conforme)
      ? "Image"
      : "",
    hasArtifact(input.artifacts, "transcription_corrigee") ? "Transcription" : "",
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
  const counts = useMemo(() => {
    const next: Record<ShelfKey, number> = {
      syntheses: 0,
      fiches: 0,
      images: 0,
      transcriptions: 0,
    };

    for (const item of data?.courses ?? []) {
      if (item.artifacts.some((artifact) => artifact.type === "synthese")) {
        next.syntheses += 1;
      }
      if (item.artifacts.some((artifact) => artifact.type === "fiche")) {
        next.fiches += 1;
      }
      if (
        item.artifacts.some(
          (artifact) => artifact.type === "transcription_corrigee",
        )
      ) {
        next.transcriptions += 1;
      }
      next.images += item.images.length;
    }

    return next;
  }, [data?.courses]);
  const allImages = useMemo(
    () => (data?.courses ?? []).flatMap((item) => item.images),
    [data?.courses],
  );
  const pendingCount = useMemo(
    () =>
      (data?.courses ?? []).filter((item) =>
        stepKeys.some(
          (step) =>
            !item.course.etapes[step].fait || item.course.etapes[step].obsolete,
        ),
      ).length,
    [data?.courses],
  );

  async function handleExportModule() {
    if (!data) {
      return;
    }

    setExporting(true);
    setExportError(null);

    try {
      await exportModuleAsZip(data);
    } catch (reason) {
      setExportError(
        reason instanceof Error
          ? reason.message
          : "Impossible d'exporter ce module.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">{data?.module.nom ?? "Module"}</h1>
        <p className="lede">
          {data
            ? `${data.professor.nom} · #${data.module.slug} · ${data.module.compteurCours} cours`
            : "Chargement du module..."}
        </p>
      </div>

      {loading ? <div className="empty-state">Chargement des rayons...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <p className="eyebrow">Firebase</p>
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && !data ? (
        <div className="empty-state">
          <p className="eyebrow">Module</p>
          <h2>Introuvable</h2>
          <p>Ce module n'existe pas encore dans Firestore.</p>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="shelf-grid">
            {shelves.map((shelf) => (
              <Link
                className={
                  shelf.archive ? "shelf-card shelf-card--archive" : "shelf-card"
                }
                key={shelf.key}
                to={`/modules/${data.module.id}/${shelf.key}`}
              >
                <span className="shelf-card__count">{counts[shelf.key]}</span>
                <strong>{shelf.title}</strong>
                <small>
                  {shelf.key === "images"
                    ? imageStatus(allImages)
                    : shelf.description}
                </small>
              </Link>
            ))}
          </div>

          <div className="course-entry">
            <div>
              <p className="eyebrow">Cours</p>
              <h2>Ouvrir un cours complet</h2>
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
                        className={
                          progress.complete
                            ? "course-entry-card course-entry-card--complete"
                            : "course-entry-card"
                        }
                        key={item.course.id}
                        to={courseEntryHref(item)}
                      >
                        <span className="course-entry-card__number">
                          {item.course.numero}
                        </span>
                        <span className="course-entry-card__body">
                          <strong>{item.course.titre || `Cours ${item.course.numero}`}</strong>
                          <small>{formatDate(item.course.date)}</small>
                          {badges.length > 0 ? (
                            <span className="course-entry-card__badges">
                              {badges.map((badge) => (
                                <em key={badge}>{badge}</em>
                              ))}
                            </span>
                          ) : null}
                        </span>
                        <span className="course-entry-card__status">
                          {progress.complete
                            ? "Terminé"
                            : `${progress.done}/${progress.total}`}
                        </span>
                      </Link>
                    );
                  })}
              </div>
            ) : (
              <div className="empty-state">Aucun cours pour ce module.</div>
            )}
          </div>

          <div className="module-actions">
            <Link className="todo-link" to="/nouveau-cours">
              Créer un nouveau cours
            </Link>
            <Link className="todo-link" to={`/modules/${data.module.id}/a-terminer`}>
              {pendingCount} à terminer
            </Link>
            <button
              className="todo-link todo-link--button"
              disabled={exporting}
              onClick={handleExportModule}
              type="button"
            >
              {exporting ? "Export..." : "Exporter le module"}
            </button>
          </div>

          {exportError ? (
            <div className="empty-state empty-state--alert">
              <p>{exportError}</p>
            </div>
          ) : null}

          <p className="export-hint">
            Archive ZIP · {exportMetadataSummary(data)}
          </p>
        </>
      ) : null}
    </section>
  );
}
