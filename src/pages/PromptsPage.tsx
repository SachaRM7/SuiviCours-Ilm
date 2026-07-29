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

const workflowOrder: Record<PromptTemplate["etape"], number> = {
  transcription: 1,
  correction: 2,
  synthese: 3,
  sources: 4,
  fiche: 5,
  prompt_image: 6,
};

export function PromptsPage() {
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [template, setTemplate] = useState("");
  const [active, setActive] = useState(true);
  const [aiProvider, setAiProvider] =
    useState<PromptTemplate["aiProvider"]>("openai");
  const [aiModel, setAiModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const load = useCallback(() => {
    void reloadKey;
    return listPromptTemplates();
  }, [reloadKey]);
  const { data, error, loading } = useAsync(load);
  const prompts = useMemo(
    () =>
      [...(data ?? [])].sort(
        (left, right) => workflowOrder[left.etape] - workflowOrder[right.etape],
      ),
    [data],
  );
  const selected = useMemo(
    () =>
      prompts.find((prompt) => prompt.id === selectedId) ?? prompts[0] ?? null,
    [prompts, selectedId],
  );
  const usesExternalTool = selected?.etape === "transcription";
  const dirty =
    Boolean(selected) &&
    (title !== selected?.titre ||
      template !== selected?.template ||
      active !== selected?.actif ||
      aiProvider !== (selected?.aiProvider ?? undefined) ||
      aiModel !== (selected?.aiModel ?? ""));

  useEffect(() => {
    if (!selected) {
      return;
    }

    setSelectedId(selected.id);
    setTitle(selected.titre);
    setTemplate(selected.template);
    setActive(selected.actif);
    setAiProvider(selected.aiProvider ?? undefined);
    setAiModel(selected.aiModel ?? "");
  }, [selected]);

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

  function selectPrompt(promptId: string) {
    if (
      dirty &&
      promptId !== selected?.id &&
      !window.confirm("Changer de prompt sans enregistrer les modifications ?")
    ) {
      return;
    }

    setSelectedId(promptId);
  }

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
        aiProvider: selected.etape === "transcription" ? undefined : aiProvider,
        aiModel: selected.etape === "transcription" ? "" : aiModel.trim(),
      });
      setReloadKey((key) => key + 1);
      setNotice("Prompt enregistré.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="stack prompts-page">
      <header className="library-head">
        <div>
          <p className="eyebrow">Pipeline IA</p>
          <h1 className="page-title">Prompts</h1>
          <p className="lede">Les six modèles utilisés par le pipeline.</p>
        </div>
        <div className="library-count">
          <strong>{prompts.length}</strong>
          <span>modèles</span>
        </div>
      </header>

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
            {prompts.map((prompt) => (
              <button
                className={
                  prompt.id === selected.id
                    ? "prompt-list__item prompt-list__item--active"
                    : "prompt-list__item"
                }
                key={prompt.id}
                onClick={() => selectPrompt(prompt.id)}
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

            {usesExternalTool ? (
              <div className="prompt-tool-note">
                <strong>Notebook Gemini</strong>
                <span>
                  Cette étape reste manuelle : aucun modèle API n'est appelé par
                  l'app.
                </span>
              </div>
            ) : (
              <div className="prompt-model-grid">
                <label className="field">
                  <span>Provider IA</span>
                  <select
                    onChange={(event) =>
                      setAiProvider(
                        event.target.value as PromptTemplate["aiProvider"],
                      )
                    }
                    value={aiProvider ?? "openai"}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                  </select>
                </label>
                <label className="field">
                  <span>Modèle recommandé</span>
                  <input
                    onChange={(event) => setAiModel(event.target.value)}
                    placeholder={
                      aiProvider === "anthropic"
                        ? "claude-sonnet-5-20260715"
                        : "gpt-5.6-luna"
                    }
                    value={aiModel}
                  />
                </label>
              </div>
            )}

            <label className="editor-pane">
              <span>Template</span>
              <textarea
                onChange={(event) => setTemplate(event.target.value)}
                value={template}
              />
            </label>

            {notice ? (
              <div aria-live="polite" className="viewer-notice">
                {notice}
              </div>
            ) : null}

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
