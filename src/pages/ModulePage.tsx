import { Link, useParams } from "react-router-dom";

const shelves = [
  ["Synthèses", "Le cours complet, structuré", "syntheses"],
  ["Fiches de révision", "L'essentiel sur une page", "fiches"],
  ["Fiches images", "À afficher, à mémoriser", "images"],
  ["Transcriptions", "Archive · le verbatim corrigé", "transcriptions"],
] as const;

export function ModulePage() {
  const { moduleId } = useParams();

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">{moduleId ?? "Module"}</h1>
        <p className="lede">
          Les rayons sont câblés dans le routeur. Les compteurs réels arrivent au
          Lot 3.
        </p>
      </div>

      <div className="shelf-grid">
        {shelves.map(([title, description, path], index) => (
          <Link
            className={index === 3 ? "shelf-card shelf-card--archive" : "shelf-card"}
            key={path}
            to={`/modules/${moduleId}/${path}`}
          >
            <span className="shelf-card__count">0</span>
            <strong>{title}</strong>
            <small>{description}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}
