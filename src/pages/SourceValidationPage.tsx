import { useCallback, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseContext,
  listCourseReferences,
  saveReferenceDecision,
} from "../lib/libraryRepository";
import type { CourseReference } from "../types/domain";

type DraftDecision = {
  choixTexte: CourseReference["choixTexte"];
  choixSource?: string | null;
};

const statusLabel: Record<CourseReference["statutAuto"], string> = {
  exacte: "Exacte",
  paraphrase: "Paraphrase",
  allusion: "Allusion",
  introuvable: "Introuvable",
};

const typeLabel: Record<CourseReference["type"], string> = {
  hadith: "Hadith",
  verset: "Verset",
  parole_savant: "Parole de savant",
};

function initialDecision(reference: CourseReference): DraftDecision {
  return {
    choixTexte:
      reference.choixTexte ??
      (reference.statutAuto === "paraphrase" ? null : "cours"),
    choixSource: reference.valide ? reference.choixSource : undefined,
  };
}

function textForDecision(reference: CourseReference, decision: DraftDecision) {
  if (decision.choixTexte === "exact" && reference.texteExact) {
    return reference.texteExact;
  }

  return reference.texteCours || reference.texteExact;
}

function isDecisionComplete(reference: CourseReference, decision: DraftDecision) {
  const textReady =
    reference.statutAuto !== "paraphrase" || Boolean(decision.choixTexte);

  return textReady && decision.choixSource !== undefined;
}

function suggestedSources(reference: CourseReference) {
  const options = [
    reference.sourceIdentifiee,
    reference.sourceIdentifiee.includes("·")
      ? reference.sourceIdentifiee.split("·")[0].trim()
      : "",
    reference.sourceIdentifiee.includes("—")
      ? reference.sourceIdentifiee.split("—")[0].trim()
      : "",
  ].filter(Boolean);

  return [...new Set(options)];
}

function statusClass(status: CourseReference["statutAuto"]) {
  return `source-badge source-badge--${status}`;
}

export function SourceValidationPage() {
  const { courseId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftDecision>>({});
  const load = useCallback(async () => {
    void reloadKey;
    if (!courseId) {
      return null;
    }

    const context = await getCourseContext(courseId);
    if (!context) {
      return null;
    }

    const references = await listCourseReferences({
      professorId: context.professor.id,
      moduleId: context.module.id,
      courseId: context.course.id,
    });

    return { ...context, references };
  }, [courseId, reloadKey]);
  const { data, error, loading } = useAsync(load);
  const decisions = useMemo(() => {
    const next: Record<string, DraftDecision> = {};

    for (const reference of data?.references ?? []) {
      next[reference.id] = drafts[reference.id] ?? initialDecision(reference);
    }

    return next;
  }, [data?.references, drafts]);
  const settledCount = useMemo(
    () =>
      (data?.references ?? []).filter((reference) =>
        isDecisionComplete(reference, decisions[reference.id]),
      ).length,
    [data?.references, decisions],
  );
  const total = data?.references.length ?? 0;
  const progress = total > 0 ? Math.round((settledCount / total) * 100) : 0;

  function updateDraft(referenceId: string, patch: Partial<DraftDecision>) {
    setDrafts((current) => ({
      ...current,
      [referenceId]: {
        ...(decisions[referenceId] ?? { choixTexte: null, choixSource: null }),
        ...patch,
      },
    }));
  }

  async function saveDecision(reference: CourseReference) {
    if (!data) {
      return;
    }

    const decision = decisions[reference.id];
    setSavingId(reference.id);

    try {
      await saveReferenceDecision({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        referenceId: reference.id,
        choixTexte: decision.choixTexte,
        choixSource: decision.choixSource?.trim() || null,
      });
      setReloadKey((key) => key + 1);
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement des sources...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir les sources."}</p>
      </div>
    );
  }

  return (
    <section className="stack source-page">
      <header>
        <p className="eyebrow">Validation des sources</p>
        <h1 className="page-title">
          {data.course.titre || `Cours ${data.course.numero}`}
        </h1>
        <p className="lede">
          {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
        </p>
      </header>

      <div className="source-note">
        Pour chaque référence, choisis ce qui partira vers la fiche et l'image.
        Une référence peut être conservée sans ligne de source imprimée.
      </div>

      <div className="source-progress" aria-label="Progression des validations">
        <span>Tranchées</span>
        <div>
          <i style={{ width: `${progress}%` }} />
        </div>
        <strong>
          {settledCount} / {total}
        </strong>
      </div>

      {data.references.length === 0 ? (
        <div className="empty-state">
          <h2>Aucune référence détectée</h2>
          <p>
            Colle d'abord la sortie de l'étape Sources dans le traitement du
            cours.
          </p>
          <Link className="tool" to={`/cours/${data.course.id}/traitement`}>
            Retour au traitement
          </Link>
        </div>
      ) : null}

      {data.references.map((reference, index) => {
        const decision = decisions[reference.id];
        const sourceOptions = suggestedSources(reference);
        const manualSource =
          decision.choixSource &&
          !sourceOptions.includes(decision.choixSource)
            ? decision.choixSource
            : "";

        return (
          <article
            className={reference.valide ? "source-card settled" : "source-card"}
            key={reference.id}
          >
            <div className="source-card__top">
              <span className="source-num">{index + 1}</span>
              <div>
                <p className="source-kind">{typeLabel[reference.type]}</p>
                <p className="source-text">{reference.texteCours}</p>
                {reference.texteArabe ? (
                  <p className="source-ar" lang="ar">
                    {reference.texteArabe}
                  </p>
                ) : null}
              </div>
              <span className={statusClass(reference.statutAuto)}>
                {statusLabel[reference.statutAuto]}
              </span>
            </div>

            <dl className="source-lines">
              <div>
                <dt>Texte exact</dt>
                <dd>{reference.texteExact || "Non fourni"}</dd>
              </div>
              <div>
                <dt>Source identifiée</dt>
                <dd>{reference.sourceIdentifiee || "Aucune source sûre"}</dd>
              </div>
            </dl>

            {reference.statutAuto === "paraphrase" ? (
              <div className="source-stage">
                <p>Texte imprimé</p>
                <div className="source-options">
                  <button
                    className={
                      decision.choixTexte === "exact" ? "tool on" : "tool"
                    }
                    onClick={() =>
                      updateDraft(reference.id, { choixTexte: "exact" })
                    }
                    type="button"
                  >
                    Texte exact
                  </button>
                  <button
                    className={
                      decision.choixTexte === "cours" ? "tool on" : "tool"
                    }
                    onClick={() =>
                      updateDraft(reference.id, { choixTexte: "cours" })
                    }
                    type="button"
                  >
                    Formulation du cours
                  </button>
                </div>
              </div>
            ) : null}

            <div className="source-stage">
              <p>Source imprimée</p>
              <div className="source-options">
                {sourceOptions.map((source) => (
                  <button
                    className={decision.choixSource === source ? "tool on" : "tool"}
                    key={source}
                    onClick={() =>
                      updateDraft(reference.id, { choixSource: source })
                    }
                    type="button"
                  >
                    {source}
                  </button>
                ))}
                <button
                  className={decision.choixSource === null ? "tool on" : "tool"}
                  onClick={() => updateDraft(reference.id, { choixSource: null })}
                  type="button"
                >
                  Ne pas inclure
                </button>
              </div>
              <input
                className="source-manual"
                onChange={(event) =>
                  updateDraft(reference.id, { choixSource: event.target.value })
                }
                placeholder="Saisir une source manuellement"
                value={manualSource}
              />
            </div>

            <div className="source-output">
              <span>{textForDecision(reference, decision)}</span>
              <strong>
                {decision.choixSource === undefined
                  ? "à trancher"
                  : decision.choixSource || "sans ligne de source"}
              </strong>
            </div>

            <button
              className="button button--primary"
              disabled={
                savingId === reference.id ||
                !isDecisionComplete(reference, decision)
              }
              onClick={() => saveDecision(reference)}
              type="button"
            >
              {savingId === reference.id ? "Enregistrement..." : "Enregistrer"}
            </button>
          </article>
        );
      })}

      <div className="source-bottom">
        <Link className="tool" to={`/cours/${data.course.id}/traitement`}>
          Retour au traitement
        </Link>
        <Link
          className={settledCount === total && total > 0 ? "tool on" : "tool"}
          to={`/cours/${data.course.id}/traitement`}
        >
          Passer à la fiche
        </Link>
      </div>
    </section>
  );
}
