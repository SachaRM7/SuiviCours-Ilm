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

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">Mes cours</h1>
        <p className="lede">Deux enseignants, modules vivants depuis Firestore.</p>
      </div>

      {loading ? <div className="empty-state">Chargement des modules...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <p className="eyebrow">Firebase</p>
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {data?.map((professor) => (
        <div className="prof-block" key={professor.id}>
          <p className="eyebrow">{professor.nom}</p>
          {professor.modules.map((module) => (
            <Link className="module-card" key={module.id} to={`/modules/${module.id}`}>
              <span>
                <strong>{module.nom}</strong>
                <small>{moduleMeta(module)}</small>
              </span>
              <span className="slug">#{module.slug}</span>
            </Link>
          ))}
          {professor.modules.length === 0 ? (
            <div className="empty-state">Aucun module pour cet enseignant.</div>
          ) : null}
        </div>
      ))}
    </section>
  );
}
