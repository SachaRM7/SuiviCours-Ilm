import { useEffect, useState } from "react";
import {
  clearReviewMark,
  getReviewMark,
  setReviewMark,
  type ReviewKind,
} from "../lib/reviewRepository";

type ReviewToggleProps = {
  kind: ReviewKind;
  itemId: string;
  label: string;
  href: string;
  meta?: string;
  compact?: boolean;
};

export function ReviewToggle({
  kind,
  itemId,
  label,
  href,
  meta,
  compact = false,
}: ReviewToggleProps) {
  const [marked, setMarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    getReviewMark({ kind, itemId })
      .then((mark) => {
        if (alive) {
          setMarked(Boolean(mark));
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false);
        }
      });

    return () => {
      alive = false;
    };
  }, [kind, itemId]);

  async function toggle() {
    setSaving(true);

    try {
      if (marked) {
        await clearReviewMark({ kind, itemId });
        setMarked(false);
      } else {
        await setReviewMark({ kind, itemId, label, href, meta });
        setMarked(true);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      className={marked ? "tool review-toggle on" : "tool review-toggle"}
      disabled={loading || saving}
      onClick={toggle}
      type="button"
    >
      <span>{marked ? "✓" : "◇"}</span>
      {compact ? (marked ? "À revoir" : "Marquer") : marked ? "À revoir" : "Marquer à revoir"}
    </button>
  );
}
