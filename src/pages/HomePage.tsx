import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { listProfessorsWithModules } from "../lib/libraryRepository";
import type { CourseModule, ModuleStatus } from "../types/domain";

const statusLabel: Record<ModuleStatus, string> = {
  en_cours: "en cours",
  termine: "terminé",
  a_venir: "à venir",
};

function moduleMeta(module: CourseModule) {
  const courseLabel =
    module.compteurCours > 1
      ? `${module.compteurCours} cours`
      : module.compteurCours === 1
        ? "1 cours"
        : "aucun cours";
  const start = module.dateDebut ? ` · depuis ${module.dateDebut}` : "";

  return `${courseLabel} · ${statusLabel[module.statut]}${start}`;
}

export function HomePage() {
  const loadLibrary = useCallback(() => listProfessorsWithModules(), []);
  const { data, error, loading } = useAsync(loadLibrary);
  const modules = data?.flatMap((professor) =>
    professor.modules.map((module) => ({ professor, module })),
  ) ?? [];
  const activeModules = modules.filter(({ module }) => module.statut === "en_cours");
  const totalCourses = modules.reduce(
    (total, { module }) => total + module.compteurCours,
    0,
  );

  return (
    <section className="stack">
      <div className="home-hero">
        <div>
          <p className="eyebrow">Suivi cours de ʿilm</p>
          <h1>Mes cours</h1>
          <p>
            Ton espace personnel pour transformer les cours en ressources
            propres, vérifiées et mémorisables.
          </p>
        </div>
        <div className="home-hero__date">
          <strong>{new Date().getDate()}</strong>
          <span>
            {new Intl.DateTimeFormat("fr-FR", {
              month: "long",
              year: "numeric",
            }).format(new Date())}
          </span>
        </div>
      </div>

      <div className="home-metrics" aria-label="Statistiques globales">
        <div>
          <strong>{totalCourses}</strong>
          <span>Cours</span>
        </div>
        <div>
          <strong>{modules.length}</strong>
          <span>Modules</span>
        </div>
        <div>
          <strong>{activeModules.length}</strong>
          <span>Actifs</span>
        </div>
      </div>

      {loading ? <div className="empty-state">Chargement des modules...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <p className="eyebrow">Firebase</p>
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {modules.length > 0 ? (
        <>
          <div className="home-section-head">
            <div>
              <h2>Mon cursus</h2>
              <p>Modules suivis et à venir</p>
            </div>
            <span>{modules.length} module{modules.length > 1 ? "s" : ""}</span>
          </div>

          <div className="curriculum-grid">
            {modules.map(({ professor, module }, index) => (
              <Link
                className={
                  module.statut === "en_cours"
                    ? "curriculum-card curriculum-card--active"
                    : "curriculum-card"
                }
                key={module.id}
                to={`/modules/${module.id}`}
              >
                <span className="curriculum-card__initial">
                  {module.nom.at(0) ?? index + 1}
                </span>
                <span className="curriculum-card__body">
                  <strong>{module.nom}</strong>
                  <small>{professor.nom}</small>
                  <em>{moduleMeta(module)}</em>
                </span>
                <span className="slug">#{module.slug}</span>
              </Link>
            ))}
          </div>

          <div className="home-section-head">
            <div>
              <h2>Mes cours inscrits</h2>
              <p>Accès rapide aux modules actifs</p>
            </div>
            <span>{activeModules.length} actif{activeModules.length > 1 ? "s" : ""}</span>
          </div>

          <div className="enrolled-list">
            {activeModules.map(({ professor, module }) => (
              <Link className="enrolled-row" key={module.id} to={`/modules/${module.id}`}>
                <span className="enrolled-row__icon">▤</span>
                <span>
                  <strong>{module.nom}</strong>
                  <small>{professor.nom} · {module.compteurCours} cours</small>
                </span>
                <em>Actif</em>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
