import { useCallback, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  listCoursesForModule,
  listProfessorsWithModules,
} from "../lib/libraryRepository";
import type { Artifact, Course, CourseModule, Professor, StepKey } from "../types/domain";

type CourseEntry = {
  professor: Professor;
  module: CourseModule;
  course: Course;
  artifacts: Artifact[];
};

type Filter = "all" | "pending" | "complete";

const stepKeys: StepKey[] = [
  "transcription",
  "correction",
  "synthese",
  "sources",
  "fiche",
  "image",
];

function progress(course: Course) {
  const done = stepKeys.filter(
    (key) => course.etapes[key].fait && !course.etapes[key].obsolete,
  ).length;

  return { done, complete: done === stepKeys.length };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

async function loadCourses() {
  const professors = await listProfessorsWithModules();
  const sections = await Promise.all(
    professors.flatMap((professor) =>
      professor.modules.map(async (module) => {
        const courses = await listCoursesForModule(professor.id, module.id);
        const entries = await Promise.all(
          courses.map(async (course): Promise<CourseEntry> => ({
            professor,
            module,
            course,
            artifacts: await getCourseArtifactsByPath(
              professor.id,
              module.id,
              course.id,
            ),
          })),
        );

        return { professor, module, entries };
      }),
    ),
  );

  return sections;
}

function availableDocuments(artifacts: Artifact[]) {
  const labels: Record<Artifact["type"], string> = {
    synthese: "Synthèse",
    fiche: "Fiche",
    transcription_corrigee: "Transcription",
    prompt_image: "Prompt image",
  };

  return artifacts.map((artifact) => labels[artifact.type]);
}

export function CoursesPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const load = useCallback(() => loadCourses(), []);
  const { data, error, loading } = useAsync(load);
  const allCourses = useMemo(
    () => (data ?? []).flatMap((section) => section.entries),
    [data],
  );
  const visibleSections = useMemo(
    () =>
      (data ?? [])
        .map((section) => ({
          ...section,
          entries: [...section.entries]
            .filter((entry) => {
              const state = progress(entry.course);
              return filter === "all" || (filter === "complete" ? state.complete : !state.complete);
            })
            .sort((left, right) => right.course.numero - left.course.numero),
        }))
        .filter((section) => section.entries.length > 0),
    [data, filter],
  );
  const pendingCount = allCourses.filter((entry) => !progress(entry.course).complete).length;
  const completeCount = allCourses.length - pendingCount;

  return (
    <section className="stack courses-page">
      <header className="library-head courses-head">
        <div>
          <p className="eyebrow">Bibliothèque personnelle</p>
          <h1 className="page-title">Mes cours</h1>
          <p className="lede">Ouvre un cours pour le lire entièrement ou reprendre son traitement.</p>
        </div>
        <Link className="todo-link todo-link--dark" to="/nouveau-cours">
          Ajouter un cours
        </Link>
      </header>

      <div className="course-filters" role="group" aria-label="Filtrer les cours">
        <button className={filter === "all" ? "tool on" : "tool"} onClick={() => setFilter("all")} type="button">
          Tous ({allCourses.length})
        </button>
        <button className={filter === "pending" ? "tool on" : "tool"} onClick={() => setFilter("pending")} type="button">
          À traiter ({pendingCount})
        </button>
        <button className={filter === "complete" ? "tool on" : "tool"} onClick={() => setFilter("complete")} type="button">
          Terminés ({completeCount})
        </button>
      </div>

      {loading ? <div className="empty-state">Chargement des cours…</div> : null}
      {error ? <div className="empty-state empty-state--alert"><h2>Lecture impossible</h2><p>{error}</p></div> : null}

      {!loading && !error && visibleSections.length === 0 ? (
        <div className="empty-state">
          <h2>Aucun cours ici</h2>
          <p>Change le filtre ou ajoute une nouvelle séance.</p>
        </div>
      ) : null}

      <div className="courses-sections">
        {visibleSections.map((section) => (
          <section className="courses-module" key={section.module.id}>
            <header>
              <div>
                <p className="eyebrow">{section.professor.nom}</p>
                <h2>{section.module.nom}</h2>
              </div>
              <Link className="text-link" to={`/modules/${section.module.id}`}>Voir le module</Link>
            </header>
            <div className="course-entry-list">
              {section.entries.map((entry) => {
                const state = progress(entry.course);
                const documents = availableDocuments(entry.artifacts);

                return (
                  <Link
                    className={state.complete ? "course-entry-card course-entry-card--complete" : "course-entry-card"}
                    key={entry.course.id}
                    to={`/cours/${entry.course.id}`}
                  >
                    <span className="course-entry-card__number">{entry.course.numero}</span>
                    <span className="course-entry-card__body">
                      <strong>{entry.course.titre || `Cours ${entry.course.numero}`}</strong>
                      <small>{formatDate(entry.course.date)}</small>
                      {documents.length > 0 ? (
                        <span className="course-entry-card__badges">
                          {documents.map((label) => <em key={label}>{label}</em>)}
                        </span>
                      ) : null}
                    </span>
                    <span className="course-entry-card__status">
                      {state.complete ? "Lire" : `${state.done}/6`}
                    </span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
