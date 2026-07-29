import { useMemo, useState } from "react";

type RepairPromptBoxProps = {
  targetLabel: string;
  title: string;
  content: string;
  context?: string;
};

function buildRepairPrompt(input: {
  targetLabel: string;
  title: string;
  content: string;
  context?: string;
  instruction: string;
}) {
  return `Tu reçois une sortie déjà produite pour mon application de suivi de cours de sciences islamiques.

TYPE DE SORTIE
${input.targetLabel}

DOCUMENT
${input.title}

CONSIGNE DE RÉPARATION
${input.instruction}

RÈGLES
- Corrige uniquement ce qui est demandé.
- Ne change pas la structure globale si elle est bonne.
- Ne raccourcis pas le contenu sans raison.
- Ne rajoute pas de source, de hadith ou de référence non vérifiée.
- Si une information est incertaine, formule prudemment au lieu d'inventer.
- Rends directement la version corrigée, sans commentaire autour.

${input.context ? `CONTEXTE UTILE\n${input.context}\n\n` : ""}SORTIE À RÉPARER
${input.content}`;
}

export function RepairPromptBox({
  targetLabel,
  title,
  content,
  context,
}: RepairPromptBoxProps) {
  const [instruction, setInstruction] = useState("");
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const prompt = useMemo(
    () =>
      instruction.trim()
        ? buildRepairPrompt({
            targetLabel,
            title,
            content,
            context,
            instruction: instruction.trim(),
          })
        : "",
    [content, context, instruction, targetLabel, title],
  );

  async function copyPrompt() {
    if (!prompt) {
      return;
    }

    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setShown(true);
  }

  return (
    <details className="repair-box">
      <summary>Réparer cette sortie</summary>
      <div className="repair-box__body">
        <p>
          Ajoute la consigne exacte, puis copie le prompt de correction adapté.
        </p>
        <textarea
          onChange={(event) => {
            setInstruction(event.target.value);
            setCopied(false);
          }}
          placeholder="Ex : corrige les titres trop longs, retire les mentions incertaines, reformule la partie 2..."
          value={instruction}
        />
        <div className="repair-box__actions">
          <button
            className="tool on"
            disabled={!prompt}
            onClick={copyPrompt}
            type="button"
          >
            Copier le prompt de réparation
          </button>
          <button
            className="tool"
            disabled={!prompt}
            onClick={() => setShown((value) => !value)}
            type="button"
          >
            {shown ? "Masquer" : "Afficher"}
          </button>
        </div>
        {copied ? <div className="notice-state">Prompt de réparation copié.</div> : null}
        {shown && prompt ? <pre className="repair-box__prompt">{prompt}</pre> : null}
      </div>
    </details>
  );
}
