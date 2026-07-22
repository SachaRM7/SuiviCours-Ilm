import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { getLibraryImage } from "../lib/libraryRepository";

export function ImageViewerPage() {
  const { courseId, imageId } = useParams();
  const load = useCallback(
    () =>
      courseId && imageId
        ? getLibraryImage(courseId, imageId)
        : Promise.resolve(null),
    [courseId, imageId],
  );
  const { data, error, loading } = useAsync(load);

  if (loading) {
    return <div className="empty-state">Chargement de l'image...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Image introuvable</h2>
        <p>{error ?? "Cette fiche image n'existe pas encore."}</p>
      </div>
    );
  }

  return (
    <section className="image-viewer">
      <div className="viewer-bar">
        <div>
          <h1>{data.course.titre || `Cours ${data.course.numero}`}</h1>
          <p>
            {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
          </p>
        </div>
        <div className="viewer-actions">
          <Link className="viewer-button" to={`/modules/${data.module.id}/images`}>
            Fermer
          </Link>
          {data.image.url ? (
            <a className="viewer-button viewer-button--primary" href={data.image.url}>
              Télécharger
            </a>
          ) : null}
        </div>
      </div>

      <div className="viewer-stage">
        {data.image.url ? (
          <img alt="" src={data.image.url} />
        ) : (
          <div className="viewer-fake">
            <strong>{data.course.numero}</strong>
            <span>Fiche de mémorisation</span>
          </div>
        )}
      </div>

      <details className="viewer-prompt">
        <summary>Voir le prompt qui a généré cette image</summary>
        <pre>{data.image.promptUtilise}</pre>
      </details>
    </section>
  );
}
