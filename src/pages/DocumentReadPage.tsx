import { useCallback } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
import { downloadMarkdown } from "../lib/exportLibrary";
import {
  getCourseArtifacts,
  getLibraryDocument,
} from "../lib/libraryRepository";
import type { Artifact, ArtifactType } from "../types/domain";

const labelByType: Record<ArtifactType, string> = {
  synthese: "Synthèse",
  fiche: "Fiche de révision",
  transcription_corrigee: "Transcription",
  prompt_image: "Prompt image",
};

const crossLinks: Array<{ type: ArtifactType; label: string }> = [
  { type: "synthese", label: "Synthèse" },
  { type: "fiche", label: "Fiche de révision" },
  { type: "transcription_corrigee", label: "Transcription" },
  { type: "prompt_image", label: "Prompt image" },
];

function hasArtifact(artifacts: Artifact[], type: ArtifactType) {
  return artifacts.some((artifact) => artifact.type === type);
}

function isMostlyArabic(children: ReactNode) {
  const text = String(children);
  const arabic = text.match(/[\u0600-\u06ff]/g)?.length ?? 0;
  return arabic > 0 && arabic >= text.length / 4;
}

export function DocumentReadPage() {
  const { courseId, type = "synthese" } = useParams();
  const artifactType = type as ArtifactType;
  const load = useCallback(async () => {
    if (!courseId) {
      return null;
    }

    const document = await getLibraryDocument(courseId, artifactType);
    if (!document) {
      return null;
    }

    const artifacts = await getCourseArtifacts(document);
    return { document, artifacts };
  }, [artifactType, courseId]);
  const { data, error, loading } = useAsync(load);

  async function copyMarkdown() {
    if (data?.document.artifact.contenu) {
      await navigator.clipboard.writeText(data.document.artifact.contenu);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement du document...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Document introuvable</h2>
        <p>{error ?? "Cet artefact n'existe pas encore."}</p>
      </div>
    );
  }

  const { document, artifacts } = data;
  const missingArtifacts = crossLinks.filter(
    (link) => !hasArtifact(artifacts, link.type),
  );

  return (
    <article className="stack">
      <header className="doc-head">
        <p className="eyebrow">{labelByType[document.artifact.type]}</p>
        <h1>{document.course.titre || `Cours ${document.course.numero}`}</h1>
        <p>
          {document.module.nom} · Cours {document.course.numero} ·{" "}
          {document.professor.nom}
        </p>
      </header>

      <div className="cross">
        {crossLinks.map((link) =>
          hasArtifact(artifacts, link.type) ? (
            <Link
              className={
                link.type === document.artifact.type ? "cx cx--primary" : "cx"
              }
              key={link.type}
              to={`/cours/${document.course.id}/${link.type}`}
            >
              <span />
              {link.label}
            </Link>
          ) : (
            <span className="cx cx--missing" key={link.type}>
              <span />
              {link.label}
            </span>
          ),
        )}
        <button className="cx cx--copy" onClick={copyMarkdown} type="button">
          Copier le .md
        </button>
        <button
          className="cx"
          onClick={() =>
            downloadMarkdown({
              course: document.course,
              artifact: document.artifact,
              module: document.module,
            })
          }
          type="button"
        >
          Télécharger le .md
        </button>
        <Link
          className="cx"
          to={`/cours/${document.course.id}/${document.artifact.type}/edit`}
        >
          Modifier
        </Link>
        <Link className="cx" to={`/cours/${document.course.id}/traitement`}>
          Traitement
        </Link>
      </div>

      {missingArtifacts.length > 0 || document.artifact.type === "prompt_image" ? (
        <div className="edit-actions">
          {missingArtifacts.map((link) => (
            <Link
              className="tool"
              key={link.type}
              to={`/cours/${document.course.id}/${link.type}/edit`}
            >
              Saisir {link.label.toLowerCase()}
            </Link>
          ))}
          {document.artifact.type === "prompt_image" ? (
            <Link className="tool on" to={`/cours/${document.course.id}/images/new`}>
              Déposer l'image générée
            </Link>
          ) : null}
        </div>
      ) : null}

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
          {document.artifact.contenu}
        </ReactMarkdown>
      </div>
    </article>
  );
}
