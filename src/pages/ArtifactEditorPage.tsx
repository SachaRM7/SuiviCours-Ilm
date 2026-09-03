import { FormEvent, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
import {
  clearCloudState,
  getCloudState,
  saveCloudState,
} from "../lib/cloudStateRepository";
import { getArtifactEditorData, saveArtifact } from "../lib/libraryRepository";
import type { ArtifactType } from "../types/domain";

const labels: Record<ArtifactType, string> = {
  synthese: "Synthèse",
  fiche: "Fiche de révision",
  transcription_corrigee: "Transcription",
  prompt_image: "Prompt image",
};

export function ArtifactEditorPage() {
  const navigate = useNavigate();
  const { courseId, type = "synthese" } = useParams();
  const artifactType = type as ArtifactType;
  const load = useCallback(
    () =>
      courseId
        ? getArtifactEditorData(courseId, artifactType)
        : Promise.resolve(null),
    [artifactType, courseId],
  );
  const { data, error, loading } = useAsync(load);
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const originalContent = data?.artifact?.contenu ?? "";
  const dirty = content !== originalContent;
  const draftKey = courseId ? `artifact-${courseId}-${artifactType}` : "";

  useEffect(() => {
    let active = true;

    if (!data || !draftKey) {
      return () => {
        active = false;
      };
    }

    setDraftReady(false);
    getCloudState<{ content: string }>(draftKey)
      .then((draft) => {
        if (active) {
          setContent(draft?.content ?? originalContent);
        }
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
  }, [data, draftKey, originalContent]);

  useEffect(() => {
    if (!draftReady || !draftKey) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const operation = dirty
        ? saveCloudState(draftKey, { content })
        : clearCloudState(draftKey);
      void operation.catch(() => undefined);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [content, dirty, draftKey, draftReady]);

  useEffect(() => {
    if (!dirty || saving) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, saving]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!data || !courseId) {
      return;
    }

    setSaving(true);
    try {
      await saveArtifact({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId,
        type: artifactType,
        contenu: content,
      });
      await clearCloudState(draftKey);
      navigate(`/cours/${courseId}/${artifactType}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement de l'éditeur...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ouvrir cet éditeur."}</p>
      </div>
    );
  }

  return (
    <form className="stack editor-page" onSubmit={handleSubmit}>
      <header className="library-head">
        <div>
          <p className="eyebrow">Édition markdown</p>
          <h1 className="page-title">{labels[artifactType]}</h1>
          <p className="lede">
            {data.module.nom} · Cours {data.course.numero} · aperçu en direct ·
            brouillon synchronisé
          </p>
        </div>
        <div className="library-count">
          <strong>{dirty ? "•" : "✓"}</strong>
          <span>{dirty ? "modifié" : "stable"}</span>
        </div>
      </header>

      <div className="editor-grid">
        <label className="editor-pane">
          <span>Markdown</span>
          <textarea
            onChange={(event) => setContent(event.target.value)}
            value={content}
          />
        </label>
        <div className="editor-pane">
          <span>Aperçu</span>
          <div className="markdown-body markdown-body--preview">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content || "Rien à prévisualiser pour l'instant."}
            </ReactMarkdown>
          </div>
        </div>
      </div>

      <div className="actions-row">
        <button className="button button--primary" disabled={saving}>
          {saving ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          className="button"
          onClick={async () => {
            if (
              dirty &&
              !window.confirm("Quitter l'éditeur sans enregistrer les modifications ?")
            ) {
              return;
            }

            await clearCloudState(draftKey);
            navigate(`/cours/${data.course.id}/${artifactType}`);
          }}
          type="button"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
