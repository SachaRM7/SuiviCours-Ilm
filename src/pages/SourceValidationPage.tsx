import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RepairPromptBox } from "../components/RepairPromptBox";
import { ReviewToggle } from "../components/ReviewToggle";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseContext,
  listCourseReferences,
  saveReferenceDecisions,
} from "../lib/libraryRepository";
import type { CourseReference } from "../types/domain";

type DraftDecision = {
  choixTexte: CourseReference["choixTexte"];
  textePersonnalise: string;
  choixSource?: string | null;
};

const statusLabel: Record<CourseReference["statutAuto"], string> = {
  exacte: "Exacte",
  paraphrase: "Paraphrase",
  allusion: "Allusion",
  introuvable: "Introuvable",
};

function initialDecision(reference: CourseReference): DraftDecision {
  return {
    choixTexte: reference.choixTexte ?? null,
    textePersonnalise: reference.textePersonnalise ?? "",
    choixSource: reference.valide ? reference.choixSource : undefined,
  };
}

function textForDecision(reference: CourseReference, decision: DraftDecision) {
  if (decision.choixTexte === "personnalise") {
    return decision.textePersonnalise.trim();
  }

  if (decision.choixTexte === "exact" && reference.texteExact) {
    return reference.texteExact;
  }

  if (decision.choixTexte === "cours" && reference.texteCours) {
    return reference.texteCours;
  }

  return "";
}

function isDecisionComplete(reference: CourseReference, decision: DraftDecision) {
  return (
    Boolean(decision.choixTexte) &&
    Boolean(textForDecision(reference, decision)) &&
    decision.choixSource !== undefined
  );
}

function cleanSource(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sourceBase(reference: CourseReference) {
  return cleanSource(
    reference.sourceIdentifiee.split("—")[0].split("·")[0] ?? "",
  );
}

function suggestedSources(reference: CourseReference) {
  const source = cleanSource(reference.sourceIdentifiee);
  const base = sourceBase(reference);
  const options: string[] = [];

  if (reference.statutAuto === "allusion" && base) {
    options.push(`Allusion a ${base}`, base);
  } else if (reference.statutAuto === "introuvable") {
    options.push(source, "Attribution non retenue");
  } else {
    options.push(source, base);
  }

  return [...new Set(options.filter(Boolean))];
}

function statusClass(status: CourseReference["statutAuto"]) {
  return `source-badge source-badge--${status}`;
}

function referenceTypeLabel(type: string) {
  const legacyLabels: Record<string, string> = {
    hadith: "Hadith",
    verset: "Verset",
    parole_savant: "Parole de savant",
  };

  return legacyLabels[type] ?? (type.trim() || "Reference");
}

function normalizeOption(value: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function isRecommendedSource(reference: CourseReference, source: string | null) {
  if (!reference.recommandationSource) {
    return false;
  }

  if (source === null) {
    return normalizeOption(reference.recommandationSource) === "ne pas inclure";
  }

  return normalizeOption(reference.recommandationSource) === normalizeOption(source);
}

function optionLabel(label: string, recommended: boolean) {
  return (
    <>
      <span>{label}</span>
      {recommended ? <em className="recommended-tag">Recommande</em> : null}
    </>
  );
}

function referencesAsText(references: CourseReference[]) {
  return references
    .map(
      (reference, index) => `${index + 1}. ${referenceTypeLabel(reference.type)}
Texte du cours : ${reference.texteCours || "-"}
Texte exact : ${reference.texteExact || "-"}
Arabe : ${reference.texteArabe || "-"}
Source : ${reference.sourceIdentifiee || "-"}
Statut : ${statusLabel[reference.statutAuto]}`,
    )
    .join("\n\n");
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
        ...(decisions[referenceId] ?? {
          choixTexte: null,
          textePersonnalise: "",
          choixSource: undefined,
        }),
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
          textePersonnalise: decisions[reference.id].textePersonnalise.trim(),
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
      <header className="library-head">
        <div>
          <p className="eyebrow">Validation des sources</p>
          <h1 className="page-title">
            {data.course.titre || `Cours ${data.course.numero}`}
          </h1>
          <p className="lede">
            {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
          </p>
        </div>
        <div className="library-count">
          <strong>{settledCount}/{total}</strong>
          <span>validées</span>
        </div>
      </header>

      <div className="source-note">
        Pour chaque reference, choisis ce qui partira vers la fiche et l'image.
        La source imprimee peut etre omise : aucune mention de doute ne descendra.
      </div>

      <div className="source-progress" aria-label="Progression des validations">
        <span>Tranchees</span>
        <div>
          <i style={{ width: `${progress}%` }} />
        </div>
        <strong>
          {settledCount} / {total}
        </strong>
      </div>

      <RepairPromptBox
        content={referencesAsText(data.references)}
        context="Cette sortie sert à valider les sources avant génération de la fiche et de l'image. Les recommandations doivent rester prudentes."
        targetLabel="Sources"
        title={`${data.module.nom} · Cours ${data.course.numero} · ${
          data.course.titre || "Sans titre"
        }`}
      />

      {data.references.length === 0 ? (
        <div className="empty-state">
          <h2>Aucune reference detectee</h2>
          <p>
            Colle d'abord la sortie de l'etape Sources dans le traitement du
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
            className={
              isDecisionComplete(reference, decision)
                ? "source-card settled"
                : "source-card"
            }
            key={reference.id}
          >
            <div className="source-card__top">
              <span className="source-num">{index + 1}</span>
              <div>
                <p className="source-kind">{referenceTypeLabel(reference.type)}</p>
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
              <ReviewToggle
                compact
                href={`/cours/${data.course.id}/sources`}
                itemId={`${data.course.id}-${reference.id}`}
                kind="source"
                label={`Source ${index + 1} - ${
                  data.course.titre || `Cours ${data.course.numero}`
                }`}
                meta={referenceTypeLabel(reference.type)}
              />
            </div>

            <dl className="source-lines">
              <div>
                <dt>Texte exact</dt>
                <dd>{reference.texteExact || "Non fourni"}</dd>
              </div>
              <div>
                <dt>Source identifiee</dt>
                <dd>{reference.sourceIdentifiee || "Aucune source sure"}</dd>
              </div>
            </dl>

            <div className="source-stage">
              <p>Texte imprime</p>
              <div className="source-options">
                {reference.texteExact ? (
                  <button
                    className={
                      decision.choixTexte === "exact" ? "tool on" : "tool"
                    }
                    onClick={() =>
                      updateDraft(reference.id, { choixTexte: "exact" })
                    }
                    type="button"
                  >
                    {optionLabel(
                      "Texte exact",
                      reference.recommandationTexte === "exact",
                    )}
                  </button>
                ) : null}
                {reference.texteCours ? (
                  <button
                    className={
                      decision.choixTexte === "cours" ? "tool on" : "tool"
                    }
                    onClick={() =>
                      updateDraft(reference.id, { choixTexte: "cours" })
                    }
                    type="button"
                  >
                    {optionLabel(
                      "Phrase du cours",
                      reference.recommandationTexte === "cours",
                    )}
                  </button>
                ) : null}
                <button
                  className={
                    decision.choixTexte === "personnalise" ? "tool on" : "tool"
                  }
                  onClick={() =>
                    updateDraft(reference.id, { choixTexte: "personnalise" })
                  }
                  type="button"
                >
                  {optionLabel(
                    "Personnalise",
                    reference.recommandationTexte === "personnalise",
                  )}
                </button>
              </div>
              {decision.choixTexte === "personnalise" ? (
                <textarea
                  className="source-manual source-manual--textarea"
                  onChange={(event) =>
                    updateDraft(reference.id, {
                      textePersonnalise: event.target.value,
                    })
                  }
                  placeholder="Saisir le texte qui sera imprime"
                  value={decision.textePersonnalise}
                />
              ) : null}
            </div>

            <div className="source-stage">
              <p>Source imprimee</p>
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
                    {optionLabel(source, isRecommendedSource(reference, source))}
                  </button>
                ))}
                <button
                  className={decision.choixSource === null ? "tool on" : "tool"}
                  onClick={() => updateDraft(reference.id, { choixSource: null })}
                  type="button"
                >
                  {optionLabel(
                    "Ne pas inclure",
                    isRecommendedSource(reference, null),
                  )}
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
              <span>{textForDecision(reference, decision) || "Texte a choisir"}</span>
              <strong>
                {decision.choixSource === undefined
                  ? "a trancher"
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
