import { FormEvent, useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
import { downloadMarkdown } from "../lib/exportLibrary";
import {
  confirmCourseTitle,
  discardArtifact,
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

const stepByArtifactType: Record<
  ArtifactType,
  "synthese" | "fiche" | "correction" | "image"
> = {
  synthese: "synthese",
  fiche: "fiche",
  transcription_corrigee: "correction",
  prompt_image: "image",
};

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
  const navigate = useNavigate();
  const artifactType = type as ArtifactType;
  const [reloadKey, setReloadKey] = useState(0);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const load = useCallback(async () => {
    void reloadKey;
    if (!courseId) {
      return null;
    }

    const document = await getLibraryDocument(courseId, artifactType);
    if (!document) {
      return null;
    }

    const artifacts = await getCourseArtifacts(document);
    return { document, artifacts };
  }, [artifactType, courseId, reloadKey]);
  const { data, error, loading } = useAsync(load);

  useEffect(() => {
    setTitleDraft(data?.document.course.titre ?? "");
  }, [data?.document.course.titre]);

  async function copyMarkdown() {
    if (data?.document.artifact.contenu) {
      await navigator.clipboard.writeText(data.document.artifact.contenu);
    }
  }

  async function saveTitle(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!data || !titleDraft.trim()) {
      return;
    }

    setSavingTitle(true);
    try {
      await confirmCourseTitle({
        professorId: data.document.professor.id,
        moduleId: data.document.module.id,
        courseId: data.document.course.id,
        titre: titleDraft.trim(),
      });
      setEditingTitle(false);
      setReloadKey((key) => key + 1);
    } finally {
      setSavingTitle(false);
    }
  }

  async function discardCurrentArtifact() {
    if (!data) {
      return;
    }

    const confirmed = window.confirm(
      "Supprimer cet ancien resultat ? L'etape repassera a faire, mais les autres artefacts du cours seront conserves.",
    );

    if (!confirmed) {
      return;
    }

    setDiscarding(true);
    try {
      await discardArtifact({
        professorId: data.document.professor.id,
        moduleId: data.document.module.id,
        courseId: data.document.course.id,
        type: data.document.artifact.type,
      });
      navigate(`/cours/${data.document.course.id}/traitement`);
    } finally {
      setDiscarding(false);
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
  const obsoleteStep = stepByArtifactType[document.artifact.type];
  const isObsolete = document.course.etapes[obsoleteStep].obsolete;
  const doneSteps = Object.values(document.course.etapes).filter(
    (step) => step.fait,
  ).length;
  const availableArtifacts = crossLinks.filter((link) =>
    hasArtifact(artifacts, link.type),
  );
  const missingArtifacts = crossLinks.filter(
    (link) => !hasArtifact(artifacts, link.type),
  );

  return (
    <article className="stack doc-reader">
      <header className="doc-head">
        <Link className="resource-back" to={`/cours/${document.course.id}/ressources`}>
          ← Ressources du cours
        </Link>
        <div className="doc-head__main">
          <div>
            <p className="eyebrow">{labelByType[document.artifact.type]}</p>
            <h1>{document.course.titre || `Cours ${document.course.numero}`}</h1>
            <p>
              {document.module.nom} · Cours {document.course.numero} ·{" "}
              {document.professor.nom}
            </p>
          </div>
          <div className="doc-head__stats" aria-label="État du cours">
            <span>
              <strong>{availableArtifacts.length}</strong>
              ressources
            </span>
            <span>
              <strong>{doneSteps}/6</strong>
              workflow
            </span>
          </div>
        </div>
      </header>

      {document.course.titre && !document.course.titreValide ? (
        <div className="title-review">
          <div>
            <p className="eyebrow">Titre proposé</p>
            <strong>{document.course.titre}</strong>
          </div>
          {editingTitle ? (
            <form className="title-review__form" onSubmit={saveTitle}>
              <input
                onChange={(event) => setTitleDraft(event.target.value)}
                value={titleDraft}
              />
              <button
                className="tool on"
                disabled={savingTitle || !titleDraft.trim()}
                type="submit"
              >
                Enregistrer
              </button>
            </form>
          ) : (
            <div className="title-review__actions">
              <button
                className="tool on"
                disabled={savingTitle}
                onClick={() => saveTitle()}
                type="button"
              >
                Valider le titre
              </button>
              <button
                className="tool"
                onClick={() => setEditingTitle(true)}
                type="button"
              >
                Modifier
              </button>
            </div>
          )}
        </div>
      ) : null}

      {isObsolete ? (
        <div className="stale-banner">
          <div>
            <p className="eyebrow">Artefact obsolète</p>
            <strong>Ce contenu reste lisible, mais il dépend d'une étape relancée.</strong>
            <p>
              Tu peux repartir du traitement pour produire une nouvelle version, ou
              supprimer cet ancien résultat explicitement.
            </p>
          </div>
          <div className="stale-banner__actions">
            <Link className="tool on" to={`/cours/${document.course.id}/traitement`}>
              Reprendre le traitement
            </Link>
            <button
              className="tool danger"
              disabled={discarding}
              onClick={discardCurrentArtifact}
              type="button"
            >
              {discarding ? "Suppression..." : "Supprimer cet ancien résultat"}
            </button>
          </div>
        </div>
      ) : null}

      <div className="doc-toolbar">
        <nav className="doc-tabs" aria-label="Artefacts du cours">
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
        </nav>

        <details className="doc-actions-menu">
          <summary>Actions</summary>
          <div className="doc-actions-menu__panel">
            <button onClick={copyMarkdown} type="button">
              Copier le .md
            </button>
            <button
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
            <Link to={`/cours/${document.course.id}/${document.artifact.type}/edit`}>
              Modifier
            </Link>
            <Link to={`/cours/${document.course.id}/ressources`}>Ressources</Link>
            <Link to={`/cours/${document.course.id}/traitement`}>Traitement</Link>
          </div>
        </details>
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
