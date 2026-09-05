import { useEffect, useState } from "react";
import type { Layout, Piece } from "./types";

const KEY = "pattern-garden:v1";

type Saved = {
  best: Record<string, number>;
  layouts: Record<string, Piece[]>;
};

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { best: {}, layouts: {} };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    return { best: parsed.best ?? {}, layouts: parsed.layouts ?? {} };
  } catch {
    return { best: {}, layouts: {} };
  }
}

function save(s: Saved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable; progress simply won't persist
  }
}

export function useProgress() {
  const [state, setState] = useState<Saved>(load);
  useEffect(() => save(state), [state]);
  return {
    best: state.best,
    layoutFor: (slug: string): Piece[] | undefined => state.layouts[slug],
    record(slug: string, score: number, layout: Layout) {
      setState((s) => ({
        best: { ...s.best, [slug]: Math.max(s.best[slug] ?? 0, score) },
        layouts: { ...s.layouts, [slug]: layout.pieces },
      }));
    },
    reset(slug: string) {
      setState((s) => {
        const layouts = { ...s.layouts };
        delete layouts[slug];
        return { ...s, layouts };
      });
    },
  };
}
