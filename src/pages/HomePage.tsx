import { useCallback } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  listCoursesForModule,
  listProfessorsWithModules,
} from "../lib/libraryRepository";
import { listReviewMarks } from "../lib/reviewRepository";
import type {
  Artifact,
  Course,
  CourseModule,
  ModuleStatus,
  Professor,
  StepKey,
  WeekdayCode,
} from "../types/domain";

const statusLabel: Record<ModuleStatus, string> = {
  en_cours: "en cours",
  termine: "terminé",
  a_venir: "à venir",
};

const stepLabels: Record<StepKey, string> = {
  transcription: "Transcription",
  correction: "Correction",
  synthese: "Synthèse",
  sources: "Sources",
  fiche: "Fiche",
  image: "Image",
};

const weekdayIndex: Record<WeekdayCode, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const weekdayLabel: Record<WeekdayCode, string> = {
  MO: "lundi",
  TU: "mardi",
  WE: "mercredi",
  TH: "jeudi",
  FR: "vendredi",
  SA: "samedi",
  SU: "dimanche",
};

type CourseBundle = {
  professor: Professor;
  module: CourseModule;
  course: Course;
  artifacts: Artifact[];
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

function weekStart(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

function isThisWeek(value: string | null, now = new Date()) {
  if (!value) {
    return false;
  }

  const date = new Date(value);
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);

  return date >= start && date < end;
}

function nextSessionForProfessor(professor: Professor) {
  const today = new Date();
  const candidates = professor.horaires.jours.map((day) => {
    const date = new Date(today);
    const delta = (weekdayIndex[day] - today.getDay() + 7) % 7;
    date.setDate(today.getDate() + delta);
    return { day, date, delta };
  });
  const next = candidates.sort((left, right) => left.delta - right.delta)[0];

  if (!next) {
    return null;
  }

  const date = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
  }).format(next.date);
  const time = professor.horaires.horaireVariable
    ? "soir, horaire à confirmer"
    : professor.horaires.heure || "horaire à renseigner";

  return {
    professor,
    label: `${weekdayLabel[next.day]} ${date}`,
    time,
  };
}

async function loadDashboard() {
  const [professors, reviewMarks] = await Promise.all([
    listProfessorsWithModules(),
    listReviewMarks(),
  ]);
  const bundlesByModule = await Promise.all(
    professors.flatMap((professor) =>
      professor.modules.map(async (module) => {
        const courses = await listCoursesForModule(professor.id, module.id);
        const courseBundles = await Promise.all(
          courses.map(async (course): Promise<CourseBundle> => ({
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

        return courseBundles;
      }),
    ),
  );

  return {
    professors,
    reviewMarks,
    bundles: bundlesByModule.flat(),
  };
}

export function HomePage() {
  const loadLibrary = useCallback(() => loadDashboard(), []);
  const { data, error, loading } = useAsync(loadLibrary);
  const professors = data?.professors ?? [];
  const modules = professors.flatMap((professor) =>
    professor.modules.map((module) => ({ professor, module })),
  );
  const activeModules = modules.filter(({ module }) => module.statut === "en_cours");
  const totalCourses = modules.reduce(
    (total, { module }) => total + module.compteurCours,
    0,
  );
  const bundles = data?.bundles ?? [];
  const coursesThisWeek = bundles.filter((bundle) =>
    isThisWeek(bundle.course.createdAt || bundle.course.date),
  ).length;
  const documentsThisWeek = bundles.reduce(
    (total, bundle) =>
      total +
      bundle.artifacts.filter((artifact) => isThisWeek(artifact.createdAt)).length,
    0,
  );
  const remainingSteps = bundles.reduce(
    (total, bundle) =>
      total +
      (Object.entries(bundle.course.etapes) as Array<
        [StepKey, Course["etapes"][StepKey]]
      >).filter(([, step]) => !step.fait || step.obsolete).length,
    0,
  );
  const nextSessions = professors
    .map(nextSessionForProfessor)
    .filter(Boolean)
    .slice(0, 3) as NonNullable<ReturnType<typeof nextSessionForProfessor>>[];
  const nextTodo = bundles
    .flatMap((bundle) =>
      (Object.entries(bundle.course.etapes) as Array<
        [StepKey, Course["etapes"][StepKey]]
      >)
        .filter(([, step]) => !step.fait || step.obsolete)
        .slice(0, 1)
        .map(([key]) => ({ ...bundle, key })),
    )
    .slice(0, 4);

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
          <strong>{coursesThisWeek}</strong>
          <span>Cours cette semaine</span>
        </div>
        <div>
          <strong>{documentsThisWeek}</strong>
          <span>Documents produits</span>
        </div>
        <div>
          <strong>{remainingSteps}</strong>
          <span>Étapes restantes</span>
        </div>
        <div>
          <strong>{data?.reviewMarks.length ?? 0}</strong>
          <span>À revoir</span>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="dashboard-card__head">
            <span>10</span>
            <div>
              <h2>Prochaines séances</h2>
              <p>Estimation d'après les horaires des enseignants.</p>
            </div>
          </div>
          <div className="dashboard-list">
            {nextSessions.map((session) => (
              <article key={session.professor.id}>
                <strong>{session.label}</strong>
                <span>
                  {session.professor.nom} · {session.time}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section className="dashboard-card">
          <div className="dashboard-card__head">
            <span>✓</span>
            <div>
              <h2>À terminer</h2>
              <p>La prochaine étape utile sur les cours actifs.</p>
            </div>
          </div>
          <div className="dashboard-list">
            {nextTodo.length > 0 ? (
              nextTodo.map((item) => (
                <Link key={`${item.course.id}-${item.key}`} to={`/cours/${item.course.id}/traitement`}>
                  <strong>
                    {item.course.titre || `Cours ${item.course.numero}`}
                  </strong>
                  <span>
                    {item.module.nom} · {stepLabels[item.key]}
                  </span>
                </Link>
              ))
            ) : (
              <article>
                <strong>Tout est au propre</strong>
                <span>Aucune étape restante pour le moment.</span>
              </article>
            )}
          </div>
        </section>
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
            <span>
              {modules.length} module{modules.length > 1 ? "s" : ""} ·{" "}
              {totalCourses} cours
            </span>
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
