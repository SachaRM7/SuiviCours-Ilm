import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseContext,
  listCourseReferences,
  saveReferenceDecisions,
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

function cleanSource(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sourceBase(reference: CourseReference) {
  return cleanSource(reference.sourceIdentifiee.split("—")[0].split("·")[0] ?? "");
}

function suggestedSources(reference: CourseReference) {
  const source = cleanSource(reference.sourceIdentifiee);
  const base = sourceBase(reference);
  const options: string[] = [];

  if (reference.statutAuto === "allusion" && base) {
    options.push(`Allusion à ${base}`, base);
  } else if (reference.statutAuto === "introuvable") {
    options.push("Attribution sans chaîne");
  } else {
    options.push(source, base);
  }

  return [...new Set(options.filter(Boolean))];
}

function statusClass(status: CourseReference["statutAuto"]) {
  return `source-badge source-badge--${status}`;
}

export function SourceValidationPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const [reloadKey, setReloadKey] = useState(0);
  const [saving, setSaving] = useState(false);
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
  const allSettled = total > 0 && settledCount === total;

  function updateDraft(referenceId: string, patch: Partial<DraftDecision>) {
    setDrafts((current) => ({
      ...current,
      [referenceId]: {
        ...(decisions[referenceId] ?? { choixTexte: null, choixSource: undefined }),
        ...patch,
      },
    }));
  }

  async function saveAll() {
    if (!data || !allSettled) {
      return;
    }

    setSaving(true);
    try {
      await saveReferenceDecisions({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId: data.course.id,
        decisions: data.references.map((reference) => ({
          referenceId: reference.id,
          choixTexte: decisions[reference.id].choixTexte,
          choixSource: decisions[reference.id].choixSource?.trim() || null,
        })),
      });
      setReloadKey((key) => key + 1);
      navigate(`/cours/${data.course.id}/traitement`);
    } finally {
      setSaving(false);
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
        La source imprimée peut être omise : aucune mention de doute ne descendra.
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
            className={isDecisionComplete(reference, decision) ? "source-card settled" : "source-card"}
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
          </article>
        );
      })}

      <div className="source-bottom">
        <Link className="tool" to={`/cours/${data.course.id}/traitement`}>
          Retour au traitement
        </Link>
        <button
          className={allSettled ? "tool on" : "tool"}
          disabled={!allSettled || saving}
          onClick={saveAll}
          type="button"
        >
          {saving ? "Validation..." : "Valider toutes les sources"}
        </button>
      </div>
    </section>
  );
}
