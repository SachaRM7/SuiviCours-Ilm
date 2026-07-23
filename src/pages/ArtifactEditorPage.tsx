import { FormEvent, useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { useNavigate, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { useAsync } from "../hooks/useAsync";
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
  const originalContent = data?.artifact?.contenu ?? "";
  const dirty = content !== originalContent;

  useEffect(() => {
    setContent(data?.artifact?.contenu ?? "");
  }, [data?.artifact?.contenu]);

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
    <form className="stack" onSubmit={handleSubmit}>
      <div>
        <h1 className="page-title">{labels[artifactType]}</h1>
        <p className="lede">
          {data.module.nom} · Cours {data.course.numero} · édition markdown
        </p>
      </div>

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
          onClick={() => {
            if (
              dirty &&
              !window.confirm("Quitter l'éditeur sans enregistrer les modifications ?")
            ) {
              return;
            }

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
