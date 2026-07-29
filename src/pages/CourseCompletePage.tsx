import { useCallback, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
import {
  getCourseArtifactsByPath,
  getCourseContext,
  getCourseImagesByPath,
  listCourseReferences,
} from "../lib/libraryRepository";
import type { Artifact, ArtifactType, CourseReference } from "../types/domain";

const artifactOrder: Array<{
  type: ArtifactType;
  title: string;
  eyebrow: string;
}> = [
  {
    type: "transcription_corrigee",
    title: "Transcription corrigée",
    eyebrow: "Archive",
  },
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
  {
    type: "prompt_image",
    title: "Prompt image",
    eyebrow: "Génération visuelle",
  },
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
    return <div className="empty-state">Chargement du cours complet...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir le cours complet."}</p>
      </div>
    );
  }

  const validatedReferences = data.references.filter((reference) => reference.valide);
  const availableSections = artifactOrder.filter(({ type }) =>
    artifactByType(data.artifacts, type),
  ).length;

  return (
    <article className="stack complete-course">
      <header className="complete-hero">
        <Link className="resource-back" to={`/cours/${data.course.id}/ressources`}>
          ← Ressources
        </Link>
        <div className="complete-hero__main">
          <div>
            <p className="eyebrow">Cours complet</p>
            <h1>{data.course.titre || `Cours ${data.course.numero}`}</h1>
            <p>
              {data.module.nom} · Cours {data.course.numero} · {data.professor.nom}
            </p>
          </div>
          <div className="doc-head__stats">
            <span>
              <strong>{availableSections}</strong>
              documents
            </span>
            <span>
              <strong>{data.images.length}</strong>
              images
            </span>
          </div>
        </div>
      </header>

      {artifactOrder.map((section) => {
        const artifact = artifactByType(data.artifacts, section.type);

        if (!artifact) {
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

      <section className="complete-section">
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
      </section>

      {data.images.length > 0 ? (
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
    </article>
  );
}
