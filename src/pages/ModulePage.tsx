import { useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { findModuleById } from "../lib/libraryRepository";

const shelves = [
  ["Synthèses", "Le cours complet, structuré", "syntheses"],
  ["Fiches de révision", "L'essentiel sur une page", "fiches"],
  ["Fiches images", "À afficher, à mémoriser", "images"],
  ["Transcriptions", "Archive · le verbatim corrigé", "transcriptions"],
] as const;

export function ModulePage() {
  const { moduleId } = useParams();
  const loadModule = useCallback(
    () => (moduleId ? findModuleById(moduleId) : Promise.resolve(null)),
    [moduleId],
  );
  const { data, error, loading } = useAsync(loadModule);
  const module = data?.module;
  const professor = data?.professor;

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">{module?.nom ?? "Module"}</h1>
        <p className="lede">
          {professor && module
            ? `${professor.nom} · #${module.slug} · ${module.compteurCours} cours`
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

      {!loading && !error && !module ? (
        <div className="empty-state">
          <p className="eyebrow">Module</p>
          <h2>Introuvable</h2>
          <p>Ce module n'existe pas encore dans Firestore.</p>
        </div>
      ) : null}

      {module ? (
        <>
          <div className="shelf-grid">
            {shelves.map(([title, description, path], index) => (
              <Link
                className={
                  index === 3 ? "shelf-card shelf-card--archive" : "shelf-card"
                }
                key={path}
                to={`/modules/${module.id}/${path}`}
              >
                <span className="shelf-card__count">0</span>
                <strong>{title}</strong>
                <small>{description}</small>
              </Link>
            ))}
          </div>
          <Link className="todo-link" to="/nouveau-cours">
            Créer un nouveau cours
          </Link>
        </>
      ) : null}
    </section>
  );
}
