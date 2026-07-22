import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { exportMetadataSummary, exportModuleAsZip } from "../lib/exportLibrary";
import { getModuleExportData } from "../lib/libraryRepository";
import type { ArtifactType, CourseImage } from "../types/domain";

type ShelfKey = "syntheses" | "fiches" | "images" | "transcriptions";

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

          <div className="module-actions">
            <Link className="todo-link" to="/nouveau-cours">
              Créer un nouveau cours
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
