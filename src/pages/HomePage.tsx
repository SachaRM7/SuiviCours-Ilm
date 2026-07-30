import { useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { getCourseArtifactsByPath, listCoursesForModule, listProfessorsWithModules } from "../lib/libraryRepository";
import { listReviewMarks } from "../lib/reviewRepository";
import type { Artifact, Course, CourseModule, Professor, StepKey, WeekdayCode } from "../types/domain";

const stepLabels: Record<StepKey, string> = {
  transcription: "Transcription",
  correction: "Correction",
  synthese: "Synthèse",
  sources: "Sources",
  fiche: "Fiche de révision",
  image: "Fiche image",
};

const weekdayIndex: Record<WeekdayCode, number> = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
const weekdayLabel: Record<WeekdayCode, string> = { MO: "lundi", TU: "mardi", WE: "mercredi", TH: "jeudi", FR: "vendredi", SA: "samedi", SU: "dimanche" };

type CourseBundle = { professor: Professor; module: CourseModule; course: Course; artifacts: Artifact[] };

function weekStart(date: Date) {
  const next = new Date(date);
  const day = next.getDay() || 7;
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() - day + 1);
  return next;
}

function isThisWeek(value: string | null, now = new Date()) {
  if (!value) return false;
  const date = new Date(value);
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return date >= start && date < end;
}

function nextSessionForProfessor(professor: Professor) {
  const today = new Date();
  const next = professor.horaires.jours
    .map((day) => ({ day, delta: (weekdayIndex[day] - today.getDay() + 7) % 7 }))
    .sort((left, right) => left.delta - right.delta)[0];
  if (!next) return null;
  const date = new Date(today);
  date.setDate(today.getDate() + next.delta);
  return {
    professor,
    label: `${weekdayLabel[next.day]} ${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date)}`,
    time: professor.horaires.horaireVariable ? "soir, horaire à confirmer" : professor.horaires.heure || "horaire à renseigner",
  };
}

async function loadDashboard() {
  const [professors, reviewMarks] = await Promise.all([listProfessorsWithModules(), listReviewMarks()]);
  const courseGroups = await Promise.all(
    professors.flatMap((professor) => professor.modules.map(async (module) => {
      const courses = await listCoursesForModule(professor.id, module.id);
      return Promise.all(
        courses.map(async (course): Promise<CourseBundle> => ({
          professor,
          module,
          course,
          artifacts: await getCourseArtifactsByPath(professor.id, module.id, course.id),
        })),
      );
    })),
  );
  return { professors, reviewMarks, bundles: courseGroups.flat() };
}

export function HomePage() {
  const { data, error, loading } = useAsync(useCallback(() => loadDashboard(), []));
  const bundles = data?.bundles ?? [];
  const modules = useMemo(() => (data?.professors ?? []).flatMap((professor) => professor.modules.map((module) => ({ professor, module }))), [data?.professors]);
  const coursesThisWeek = bundles.filter((bundle) => isThisWeek(bundle.course.createdAt || bundle.course.date)).length;
  const documentsThisWeek = bundles.reduce((total, bundle) => total + bundle.artifacts.filter((artifact) => isThisWeek(artifact.createdAt)).length, 0);
  const remainingSteps = bundles.reduce((total, bundle) => total + (Object.values(bundle.course.etapes).filter((step) => !step.fait || step.obsolete).length), 0);
  const nextTodo = bundles
    .map((bundle) => ({ ...bundle, step: (Object.keys(bundle.course.etapes) as StepKey[]).find((key) => !bundle.course.etapes[key].fait || bundle.course.etapes[key].obsolete) }))
    .filter((item): item is CourseBundle & { step: StepKey } => Boolean(item.step))
    .sort((left, right) => right.course.numero - left.course.numero)
    .slice(0, 4);
  const nextSessions = (data?.professors ?? []).map(nextSessionForProfessor).filter(Boolean).slice(0, 3) as NonNullable<ReturnType<typeof nextSessionForProfessor>>[];

  return (
    <section className="stack home-page">
      <header className="home-hero">
        <div>
          <p className="eyebrow">Suivi cours de 'ilm</p>
          <h1>Accueil</h1>
          <p>Retrouve ici ce qui mérite ton attention, puis reprends directement ton cours.</p>
        </div>
        <div className="home-hero__date"><strong>{new Date().getDate()}</strong><span>{new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date())}</span></div>
      </header>

      <div className="home-metrics" aria-label="Statistiques globales">
        <div><strong>{coursesThisWeek}</strong><span>Cours cette semaine</span></div>
        <div><strong>{documentsThisWeek}</strong><span>Documents produits</span></div>
        <div><strong>{remainingSteps}</strong><span>Étapes restantes</span></div>
        <div><strong>{data?.reviewMarks.length ?? 0}</strong><span>À revoir</span></div>
      </div>

      <div className="dashboard-grid">
        <section className="dashboard-card">
          <div className="dashboard-card__head"><span>→</span><div><h2>À reprendre</h2><p>La prochaine action utile pour chaque cours ouvert.</p></div></div>
          <div className="dashboard-list">
            {nextTodo.length > 0 ? nextTodo.map((item) => <Link key={item.course.id} to={`/cours/${item.course.id}/traitement`}><strong>{item.course.titre || `Cours ${item.course.numero}`}</strong><span>{item.module.nom} · {stepLabels[item.step]}</span></Link>) : <article><strong>Tout est à jour</strong><span>Aucun cours ne demande d'action.</span></article>}
          </div>
        </section>
        <section className="dashboard-card">
          <div className="dashboard-card__head"><span>10</span><div><h2>Prochaines séances</h2><p>Estimation d'après les horaires enregistrés.</p></div></div>
          <div className="dashboard-list">{nextSessions.map((session) => <article key={session.professor.id}><strong>{session.label}</strong><span>{session.professor.nom} · {session.time}</span></article>)}</div>
        </section>
      </div>

      {loading ? <div className="empty-state">Chargement de l'accueil…</div> : null}
      {error ? <div className="empty-state empty-state--alert"><h2>Lecture impossible</h2><p>{error}</p></div> : null}

      {!loading && !error ? (
        <section className="home-courses">
          <div className="home-section-head"><div><p className="eyebrow">Bibliothèque</p><h2>Mes cours</h2><p>{modules.length} module{modules.length > 1 ? "s" : ""} disponible{modules.length > 1 ? "s" : ""}.</p></div><Link className="todo-link" to="/cours">Voir tous les cours</Link></div>
          <div className="enrolled-list">{modules.filter(({ module }) => module.statut !== "a_venir").map(({ professor, module }) => <Link className="enrolled-row" key={module.id} to={`/modules/${module.id}`}><span className="enrolled-row__icon">▤</span><span><strong>{module.nom}</strong><small>{professor.nom} · {module.compteurCours} cours</small></span><em>{module.statut === "en_cours" ? "Actif" : "Terminé"}</em></Link>)}</div>
        </section>
      ) : null}
    </section>
  );
}
