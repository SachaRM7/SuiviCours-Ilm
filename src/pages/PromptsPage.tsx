import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useAsync } from "../hooks/useAsync";
import {
  listPromptTemplates,
  updatePromptTemplate,
} from "../lib/promptRepository";
import type { PromptTemplate } from "../types/domain";

const stepLabels: Record<PromptTemplate["etape"], string> = {
  transcription: "Transcription",
  correction: "Correction",
  synthese: "Synthèse",
  sources: "Sources",
  fiche: "Fiche",
  prompt_image: "Prompt image",
};

export function PromptsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    void reloadKey;
    return listPromptTemplates();
  }, [reloadKey]);
  const { data, error, loading } = useAsync(load);
  const selected = useMemo(
    () => data?.find((prompt) => prompt.id === selectedId) ?? data?.[0] ?? null,
    [data, selectedId],
  );

  useEffect(() => {
    if (!selected) {
      return;
    }

    setSelectedId(selected.id);
    setTitle(selected.titre);
    setTemplate(selected.template);
    setActive(selected.actif);
  }, [selected]);

  async function copyPrompt() {
    if (!selected) {
      return;
    }

    await navigator.clipboard.writeText(template);
    setNotice("Prompt copié.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selected) {
      return;
    }

    setSaving(true);
    setNotice(null);

    try {
      await updatePromptTemplate({
        promptId: selected.id,
        titre: title.trim() || selected.titre,
        template,
        actif: active,
      });
      setReloadKey((key) => key + 1);
      setNotice("Prompt enregistré.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack">
      <div>
        <h1 className="page-title">Prompts</h1>
        <p className="lede">Les six modèles utilisés par le pipeline.</p>
      </div>

      {loading ? <div className="empty-state">Chargement des prompts...</div> : null}

      {error ? (
        <div className="empty-state empty-state--alert">
          <h2>Lecture impossible</h2>
          <p>{error}</p>
        </div>
      ) : null}

      {!loading && !error && !selected ? (
        <div className="empty-state">
          <h2>Aucun prompt</h2>
          <p>Lance le script de seed pour charger les six modèles.</p>
        </div>
      ) : null}

      {selected ? (
        <div className="prompt-admin">
          <aside className="prompt-list" aria-label="Liste des prompts">
            {(data ?? []).map((prompt) => (
              <button
                className={
                  prompt.id === selected.id
                    ? "prompt-list__item prompt-list__item--active"
                    : "prompt-list__item"
                }
                key={prompt.id}
                onClick={() => setSelectedId(prompt.id)}
                type="button"
              >
                <strong>{stepLabels[prompt.etape]}</strong>
                <span>
                  v{prompt.version} · {prompt.actif ? "actif" : "inactif"}
                </span>
              </button>
            ))}
          </aside>

          <form className="prompt-editor" onSubmit={handleSubmit}>
            <div className="prompt-editor__top">
              <label className="field">
                <span>Titre</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>
              <label className="prompt-active">
                <input
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  type="checkbox"
                />
                Prompt actif
              </label>
            </div>

            <label className="editor-pane">
              <span>Template</span>
              <textarea
                onChange={(event) => setTemplate(event.target.value)}
                value={template}
              />
            </label>

            {notice ? <div className="viewer-notice">{notice}</div> : null}

            <div className="actions-row">
              <button className="button button--primary" disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
              <button className="button" onClick={copyPrompt} type="button">
                Copier
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
