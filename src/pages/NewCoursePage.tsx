import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  clearCloudState,
  getCloudState,
  saveCloudState,
} from "../lib/cloudStateRepository";
import {
  createCourse,
  listProfessorsWithModules,
  validateAudioFile,
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

function formatReadableDate(value: string) {
  if (!value) {
    return "Date à choisir";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
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

type NewCourseDraft = {
  professorId: string;
  moduleId: string;
  numero: number;
  date: string;
  time: string;
  titre: string;
  showForm: boolean;
};

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
  const [audioFiles, setAudioFiles] = useState<File[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);

  useEffect(() => {
    let active = true;

    getCloudState<NewCourseDraft>("new-course")
      .then((draft) => {
        if (!active || !draft) {
          return;
        }

        setProfessorId(draft.professorId);
        setModuleId(draft.moduleId);
        setNumero(draft.numero);
        setDate(draft.date);
        setTime(draft.time);
        setTitre(draft.titre);
        setShowForm(draft.showForm);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) {
          setDraftReady(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    const timeout = window.setTimeout(() => {
      void saveCloudState<NewCourseDraft>("new-course", {
        professorId,
        moduleId,
        numero,
        date,
        time,
        titre,
        showForm,
      }).catch(() => undefined);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [date, draftReady, moduleId, numero, professorId, showForm, time, titre]);

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

  async function createSelectedCourse(input?: { quick?: boolean }) {
    if (!selectedProfessor || !selectedModule || !date) {
      return;
    }

    if (input?.quick && selectedProfessor.horaires.horaireVariable && !time) {
      setShowForm(true);
      setMessage("Précise l'heure du cours avant de le créer.");
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
        audioFiles: input?.quick ? [] : audioFiles,
      });
      await clearCloudState("new-course");
      navigate(`/cours/${courseId}/traitement`);
    } catch (reason) {
      setMessage(
        reason instanceof Error ? reason.message : "Impossible de créer le cours.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createSelectedCourse();
  }

  return (
    <section className="stack new-course-page">
      <header className="new-course-hero">
        <div>
          <p className="eyebrow">Nouveau cours</p>
          <h1 className="page-title">Préparer une séance</h1>
          <p className="lede">
            Crée le cours, puis ouvre directement le traitement. Le titre pourra
            venir de la synthèse.
          </p>
        </div>
        <div className="new-course-hero__badge">
          <strong>{numero || 1}</strong>
          <span>prochain cours</span>
        </div>
      </header>

      {loading ? <div className="empty-state">Chargement des modules...</div> : null}
      {error ? <div className="empty-state empty-state--alert">{error}</div> : null}

      {suggestion ? (
        <div className="guess-card">
          <div className="guess-card__head">
            <div>
              <p className="eyebrow">Proposition</p>
              <h2>
                {suggestion.module.nom} · Cours {suggestion.module.compteurCours + 1}
              </h2>
              <p>
                {suggestion.professor.nom} · numéro suivant du module actif.
              </p>
            </div>
            <span className="dest-pill">
              {suggestion.professor.horaires.horaireVariable
                ? "Horaire variable"
                : "Créneau habituel"}
            </span>
          </div>
          <div className="course-plan">
            <span>
              <strong>{formatReadableDate(date)}</strong>
              date proposée
            </span>
            <span>
              <strong>{time || "à remplir"}</strong>
              heure
            </span>
            <span>
              <strong>{selectedModule?.nom ?? suggestion.module.nom}</strong>
              module
            </span>
          </div>
          {!showForm ? (
            <div className="guess-actions">
              <button
                className="button button--primary"
                disabled={
                  saving ||
                  Boolean(selectedProfessor?.horaires.horaireVariable && !time)
                }
                onClick={() => createSelectedCourse({ quick: true })}
                type="button"
              >
                {saving ? "Création..." : "C'est ça"}
              </button>
              <button
                className="button"
                onClick={() => setShowForm(true)}
                type="button"
              >
                Modifier
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {data && (showForm || !suggestion) ? (
        <form className="edit-card new-course-form" onSubmit={handleSubmit}>
          <div className="new-course-form__section">
            <div>
              <p className="eyebrow">Cours</p>
              <h2>Informations principales</h2>
            </div>
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
          </div>

          <div className="new-course-form__section">
            <div>
              <p className="eyebrow">Séance</p>
              <h2>Date et support</h2>
            </div>
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

            <label className="audio-drop">
              <input
                accept=".m4a,.mp3,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav"
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);

                  setMessage(null);

                  if (files.length === 0) {
                    setAudioFiles([]);
                    return;
                  }

                  try {
                    files.forEach(validateAudioFile);
                    setAudioFiles(files);
                  } catch (reason) {
                    event.target.value = "";
                    setAudioFiles([]);
                    setMessage(
                      reason instanceof Error
                        ? reason.message
                        : "Fichier audio invalide.",
                    );
                  }
                }}
                multiple
                type="file"
              />
              <span className="audio-drop__icon">♪</span>
              <span>
                <strong>
                  {audioFiles.length > 0
                    ? `${audioFiles.length} partie${audioFiles.length > 1 ? "s" : ""} sélectionnée${audioFiles.length > 1 ? "s" : ""}`
                    : "Déposer une ou plusieurs parties audio"}
                </strong>
                <small>
                  Facultatif · ordre de sélection conservé · 25 Mo max par partie
                </small>
              </span>
            </label>
          </div>

          {message ? <p className="form-error">{message}</p> : null}

          <button className="button button--primary" disabled={saving}>
            {saving ? "Création..." : "Créer et ouvrir le traitement"}
          </button>
        </form>
      ) : null}
    </section>
  );
}
