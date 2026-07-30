import { useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams, useSearchParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
import { printCurrentPageAsPdf } from "../lib/exportLibrary";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  getCourseImagesByPath,
  listCourseReferences,
} from "../lib/libraryRepository";
import type { Artifact, ArtifactType, CourseReference, StepKey } from "../types/domain";

const readingArtifacts: Array<{
  type: ArtifactType;
  title: string;
  eyebrow: string;
}> = [
  {
    type: "synthese",
    title: "Synthèse",
    eyebrow: "Cours structuré",
  },
  {
    type: "fiche",
    title: "Fiche de révision",
    eyebrow: "Mémorisation",
  },
];

const archiveArtifacts: Array<{ type: ArtifactType; title: string }> = [
  { type: "transcription_corrigee", title: "Transcription corrigée" },
  { type: "prompt_image", title: "Prompt image" },
];

const workflowOrder: Array<{ key: StepKey; label: string }> = [
  { key: "transcription", label: "Transcription" },
  { key: "correction", label: "Correction" },
  { key: "synthese", label: "Synthèse" },
  { key: "sources", label: "Sources" },
  { key: "fiche", label: "Fiche de révision" },
  { key: "image", label: "Fiche image" },
];

type ReaderView = "synthese" | "fiche" | "sources" | "images" | "tout";

const readerTabs: Array<{ key: Exclude<ReaderView, "tout">; label: string }> = [
  { key: "synthese", label: "Synthèse" },
  { key: "fiche", label: "Fiche" },
  { key: "sources", label: "Sources" },
  { key: "images", label: "Image" },
];

function isMostlyArabic(children: ReactNode) {
  const text = String(children);
  const arabic = text.match(/[\u0600-\u06ff]/g)?.length ?? 0;
  return arabic > 0 && arabic >= text.length / 4;
}

function artifactByType(artifacts: Artifact[], type: ArtifactType) {
  return artifacts.find((artifact) => artifact.type === type) ?? null;
}

function selectedReferenceText(reference: CourseReference) {
  if (reference.choixTexte === "personnalise") {
    return reference.textePersonnalise;
  }

  if (reference.choixTexte === "exact") {
    return reference.texteExact;
  }

  if (reference.choixTexte === "cours") {
    return reference.texteCours;
  }

  return reference.texteExact || reference.texteCours;
}

export function CourseCompletePage() {
  const { courseId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const load = useCallback(async () => {
    if (!courseId) {
      return null;
    }

    const context = await getCourseContext(courseId);
    if (!context) {
      return null;
    }

    const [artifacts, images, references] = await Promise.all([
      getCourseArtifactsByPath(
        context.professor.id,
        context.module.id,
        context.course.id,
      ),
      getCourseImagesByPath(
        context.professor.id,
        context.module.id,
        context.course.id,
      ),
      listCourseReferences({
        professorId: context.professor.id,
        moduleId: context.module.id,
        courseId: context.course.id,
      }),
    ]);

    return { ...context, artifacts, images, references };
  }, [courseId]);
  const { data, error, loading } = useAsync(load);

  if (loading) {
    return <div className="empty-state">Chargement du cours…</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir ce cours."}</p>
      </div>
    );
  }

  const validatedReferences = data.references.filter((reference) => reference.valide);
  const workflowDone = workflowOrder.filter(
    (item) => data.course.etapes[item.key].fait && !data.course.etapes[item.key].obsolete,
  ).length;
  const unresolvedReferences = data.references.some((reference) => !reference.valide);
  const nextWorkflowStep = workflowOrder.find(
    (item) => !data.course.etapes[item.key].fait || data.course.etapes[item.key].obsolete,
  );
  const nextAction = unresolvedReferences
    ? { label: "Valider les sources", href: `/cours/${data.course.id}/sources` }
    : nextWorkflowStep
      ? { label: `Continuer : ${nextWorkflowStep.label}`, href: `/cours/${data.course.id}/traitement` }
      : null;
  const requestedView = searchParams.get("vue") as ReaderView | null;
  const hasSynthesis = Boolean(artifactByType(data.artifacts, "synthese"));
  const hasFiche = Boolean(artifactByType(data.artifacts, "fiche"));
  const currentView: ReaderView =
    requestedView && ["synthese", "fiche", "sources", "images", "tout"].includes(requestedView)
      ? requestedView
      : hasSynthesis
        ? "synthese"
        : hasFiche
          ? "fiche"
          : "sources";
  const fullView = currentView === "tout";

  function selectView(view: ReaderView) {
    const next = new URLSearchParams(searchParams);
    if (view === "synthese") {
      next.delete("vue");
    } else {
      next.set("vue", view);
    }
    setSearchParams(next, { replace: true });
  }

  return (
    <article className="stack complete-course">
      <header className="complete-hero">
        <Link className="resource-back" to={`/modules/${data.module.id}`}>
          ← {data.module.nom}
        </Link>
        <div className="complete-hero__main">
          <div>
            <p className="eyebrow">Cours</p>
            <h1>{data.course.titre || `Cours ${data.course.numero}`}</h1>
            <p>
              {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
            </p>
          </div>
          <div className="doc-head__stats">
            <span>
              <strong>{workflowDone}/6</strong>
              traitement
            </span>
            <span>
              <strong>{data.images.length}</strong>
              images
            </span>
          </div>
        </div>
        <div className="complete-hero__actions">
          {nextAction ? <Link className="viewer-button viewer-button--primary" to={nextAction.href}>{nextAction.label}</Link> : null}
          <button
            className="viewer-button complete-print"
            onClick={() => printCurrentPageAsPdf(`${data.module.nom} - cours ${data.course.numero} - complet`)}
            type="button"
          >
            Exporter PDF
          </button>
        </div>
      </header>

      {nextAction ? (
        <div className="course-next-action">
          <div>
            <p className="eyebrow">À poursuivre</p>
            <strong>{nextAction.label.replace("Continuer : ", "")}</strong>
            <span>Une seule action est nécessaire pour faire avancer ce cours.</span>
          </div>
          <Link className="tool on" to={nextAction.href}>{nextAction.label}</Link>
        </div>
      ) : (
        <div className="course-next-action course-next-action--complete">
          <div><p className="eyebrow">Cours terminé</p><strong>Prêt à lire, réviser et archiver.</strong></div>
        </div>
      )}

      <nav className="course-reader-tabs" aria-label="Sections du cours">
        {readerTabs.map((tab) => {
          const available =
            tab.key === "synthese"
              ? hasSynthesis
              : tab.key === "fiche"
                ? hasFiche
                : tab.key === "sources"
                  ? data.references.length > 0 || data.course.etapes.sources.fait
                  : data.images.length > 0;
          return (
            <button
              aria-current={currentView === tab.key ? "page" : undefined}
              className={currentView === tab.key ? "course-reader-tab active" : "course-reader-tab"}
              key={tab.key}
              onClick={() => selectView(tab.key)}
              type="button"
            >
              <span>{tab.label}</span>
              {available ? <i /> : null}
            </button>
          );
        })}
        <button
          className={fullView ? "course-reader-tab course-reader-tab--all active" : "course-reader-tab course-reader-tab--all"}
          onClick={() => selectView("tout")}
          type="button"
        >
          Vue complète
        </button>
      </nav>

      {readingArtifacts.map((section) => {
        const artifact = artifactByType(data.artifacts, section.type);

        if (!artifact || (!fullView && currentView !== section.type)) {
          return null;
        }

        return (
          <section className="complete-section" key={section.type}>
            <div className="complete-section__head">
              <p className="eyebrow">{section.eyebrow}</p>
              <h2>{section.title}</h2>
              <Link className="tool" to={`/cours/${data.course.id}/${section.type}`}>
                Ouvrir seul
              </Link>
            </div>
            <div className="markdown-body">
              <ReactMarkdown
                components={{
                  p: ({ children }) => (
                    <p className={isMostlyArabic(children) ? "ar" : undefined}>
                      {children}
                    </p>
                  ),
                }}
                remarkPlugins={[remarkGfm]}
              >
                {artifact.contenu}
              </ReactMarkdown>
            </div>
          </section>
        );
      })}

      {fullView || currentView === "sources" ? <section className="complete-section">
        <div className="complete-section__head">
          <p className="eyebrow">Références</p>
          <h2>Sources validées</h2>
          <Link className="tool" to={`/cours/${data.course.id}/sources`}>
            Valider
          </Link>
        </div>
        {validatedReferences.length > 0 ? (
          <div className="complete-sources">
            {validatedReferences.map((reference, index) => (
              <article key={reference.id}>
                <span>{index + 1}</span>
                <div>
                  <strong>{selectedReferenceText(reference)}</strong>
                  {reference.choixSource ? <small>{reference.choixSource}</small> : null}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>Aucune source validée</h2>
            <p>Les références apparaîtront ici après validation des sources.</p>
          </div>
        )}
      </section> : null}

      {(fullView || currentView === "images") && data.images.length > 0 ? (
        <section className="complete-section">
          <div className="complete-section__head">
            <p className="eyebrow">Images</p>
            <h2>Fiches images</h2>
            <Link className="tool" to={`/images/${data.course.id}/${data.images[0].id}`}>
              Ouvrir
            </Link>
          </div>
          <div className="complete-images">
            {data.images.map((image) => (
              <Link key={image.id} to={`/images/${data.course.id}/${image.id}`}>
                {image.url ? (
                  <img
                    alt={`Fiche image du cours ${data.course.numero}`}
                    loading="lazy"
                    src={image.url}
                  />
                ) : (
                  <span>{data.course.numero}</span>
                )}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {(fullView || currentView === "images") && data.images.length === 0 ? (
        <section className="complete-section">
          <div className="complete-section__head">
            <p className="eyebrow">Images</p>
            <h2>Fiches images</h2>
          </div>
          <div className="empty-state">
            <h2>Aucune fiche image</h2>
            <p>Elle apparaîtra ici après sa génération et son dépôt.</p>
            <Link className="tool on" to={`/cours/${data.course.id}/images/new`}>Déposer une image</Link>
          </div>
        </section>
      ) : null}

      {archiveArtifacts.some(({ type }) => artifactByType(data.artifacts, type)) ? (
        <details className="course-archive">
          <summary>Archives et éléments de production</summary>
          <div>
            {archiveArtifacts.map((section) => {
              const artifact = artifactByType(data.artifacts, section.type);
              if (!artifact) return null;
              return <Link key={section.type} to={`/cours/${data.course.id}/${section.type}`}>{section.title}</Link>;
            })}
          </div>
        </details>
      ) : null}
    </article>
  );
}
