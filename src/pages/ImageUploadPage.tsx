import { FormEvent, useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { getArtifactEditorData, saveCourseImage } from "../lib/libraryRepository";

export function ImageUploadPage() {
  const navigate = useNavigate();
  const { courseId } = useParams();
  const load = useCallback(
    () =>
      courseId
        ? getArtifactEditorData(courseId, "prompt_image")
        : Promise.resolve(null),
    [courseId],
  );
  const { data, error, loading } = useAsync(load);
  const [file, setFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = Boolean(file) || prompt.trim().length > 0;

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

    if (!data || !courseId || !file) {
      return;
    }

    setSaving(true);
    try {
      const imageId = await saveCourseImage({
        professorId: data.professor.id,
        moduleId: data.module.id,
        courseId,
        file,
        promptUtilise: prompt || data.artifact?.contenu || "",
      });
      navigate(`/images/${courseId}/${imageId}`);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="empty-state">Chargement du cours...</div>;
  }

  if (error || !data) {
    return (
      <div className="empty-state empty-state--alert">
        <h2>Cours introuvable</h2>
        <p>{error ?? "Impossible d'ajouter une image ici."}</p>
      </div>
    );
  }

  return (
    <form className="stack narrow" onSubmit={handleSubmit}>
      <div>
        <h1 className="page-title">Ajouter une fiche image</h1>
        <p className="lede">
          {data.module.nom} · Cours {data.course.numero}
        </p>
      </div>

      <div className="edit-card">
        <label className="field">
          <span>Image</span>
          <input
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            type="file"
          />
        </label>
        <label className="field">
          <span>Prompt utilisé</span>
          <textarea
            className="plain-textarea"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder={data.artifact?.contenu ?? "Prompt qui a généré l'image"}
            value={prompt}
          />
        </label>
        <button className="button button--primary" disabled={saving || !file}>
          {saving ? "Envoi..." : "Déposer l'image"}
        </button>
      </div>
    </form>
  );
}
