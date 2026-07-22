import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  createCourse,
  listProfessorsWithModules,
  type ProfessorWithModules,
} from "../lib/libraryRepository";

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function previousWeekday(targetDay: number) {
  const date = new Date();
  const diff = (date.getDay() - targetDay + 7) % 7;
  date.setDate(date.getDate() - diff);
  return date;
}

const dayCodeToNumber: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

function findDefaultModule(professors: ProfessorWithModules[]) {
  return (
    professors
      .flatMap((professor) =>
        professor.modules.map((module) => ({ professor, module })),
      )
      .find(({ module }) => module.statut === "en_cours") ?? null
  );
}

export function NewCoursePage() {
  const navigate = useNavigate();
  const load = useCallback(() => listProfessorsWithModules(), []);
  const { data, error, loading } = useAsync(load);
  const suggestion = useMemo(() => (data ? findDefaultModule(data) : null), [data]);
  const [professorId, setProfessorId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [numero, setNumero] = useState(1);
  const [date, setDate] = useState(isoDate(new Date()));
  const [time, setTime] = useState("20:30");
  const [titre, setTitre] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!suggestion || professorId || moduleId) {
      return;
    }

    const firstDay = suggestion.professor.horaires.jours[0];
    const guessedDate = previousWeekday(dayCodeToNumber[firstDay] ?? 1);
    setProfessorId(suggestion.professor.id);
    setModuleId(suggestion.module.id);
    setNumero(suggestion.module.compteurCours + 1);
    setDate(isoDate(guessedDate));
    setTime(
      suggestion.professor.horaires.horaireVariable
        ? ""
        : suggestion.professor.horaires.heure ?? "",
    );
  }, [moduleId, professorId, suggestion]);

  const selectedProfessor = data?.find((professor) => professor.id === professorId);
  const selectedModule = selectedProfessor?.modules.find(
    (module) => module.id === moduleId,
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedProfessor || !selectedModule) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const courseId = await createCourse({
        professorId,
        moduleId,
        numero,
        titre,
        date: `${date}T${time || "00:00"}:00`,
      });
      navigate(`/cours/${courseId}/synthese/edit`);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Impossible de créer le cours.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack narrow">
      <div>
        <h1 className="page-title">Nouveau cours</h1>
        <p className="lede">
          Le titre peut rester vide : il viendra de la synthèse.
        </p>
      </div>

      {loading ? <div className="empty-state">Chargement des modules...</div> : null}
      {error ? <div className="empty-state empty-state--alert">{error}</div> : null}

      {suggestion ? (
        <div className="guess-card">
          <p className="eyebrow">Proposition</p>
          <h2>
            {suggestion.module.nom} · Cours {suggestion.module.compteurCours + 1}
          </h2>
          <p>
            {suggestion.professor.nom} · numéro suivant du module actif.{" "}
            {suggestion.professor.horaires.horaireVariable
              ? "Horaire à préciser."
              : `Créneau indicatif ${suggestion.professor.horaires.heure}.`}
          </p>
        </div>
      ) : null}

      {data ? (
        <form className="edit-card" onSubmit={handleSubmit}>
          <label className="field">
            <span>Enseignant</span>
            <select
              onChange={(event) => {
                const nextProfessor = data.find(
                  (professor) => professor.id === event.target.value,
                );
                setProfessorId(event.target.value);
                const nextModule = nextProfessor?.modules[0];
                setModuleId(nextModule?.id ?? "");
                setNumero((nextModule?.compteurCours ?? 0) + 1);
                setTime(
                  nextProfessor?.horaires.horaireVariable
                    ? ""
                    : nextProfessor?.horaires.heure ?? "",
                );
              }}
              value={professorId}
            >
              {data.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.nom}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Module</span>
            <select
              onChange={(event) => {
                const next = selectedProfessor?.modules.find(
                  (module) => module.id === event.target.value,
                );
                setModuleId(event.target.value);
                setNumero((next?.compteurCours ?? 0) + 1);
              }}
              value={moduleId}
            >
              {selectedProfessor?.modules.map((module) => (
                <option key={module.id} value={module.id}>
                  {module.nom}
                </option>
              ))}
            </select>
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Numéro</span>
              <input
                min="1"
                onChange={(event) => setNumero(Number(event.target.value))}
                type="number"
                value={numero}
              />
            </label>
            <label className="field">
              <span>Date</span>
              <input
                onChange={(event) => setDate(event.target.value)}
                type="date"
                value={date}
              />
            </label>
            <label className="field">
              <span>Heure</span>
              <input
                onChange={(event) => setTime(event.target.value)}
                type="time"
                value={time}
              />
            </label>
          </div>

          <label className="field">
            <span>Titre optionnel</span>
            <input
              onChange={(event) => setTitre(event.target.value)}
              placeholder="Laisse vide si la synthèse doit le proposer"
              type="text"
              value={titre}
            />
          </label>

          {message ? <p className="form-error">{message}</p> : null}

          <button className="button button--primary" disabled={saving}>
            {saving ? "Création..." : "Créer et saisir la synthèse"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
