import { useEffect, useState } from "react";
import type { Layout, Piece } from "./types";
import { levelBySlug } from "./levels";
import { migrateLegacyAlcoveSeats } from "./geometry";

const KEY = "pattern-garden:v1";
const VERSION = 2;

type Saved = {
  version: number;
  best: Record<string, number>;
  layouts: Record<string, Piece[]>;
};

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { version: VERSION, best: {}, layouts: {} };
    const parsed = JSON.parse(raw) as Partial<Saved>;
    const layouts = parsed.layouts ?? {};
    if ((parsed.version ?? 1) < VERSION && layouts.alcoves) {
      const level = levelBySlug("alcoves");
      if (level) layouts.alcoves = migrateLegacyAlcoveSeats(level, layouts.alcoves);
    }
    return { version: VERSION, best: parsed.best ?? {}, layouts };
  } catch {
    return { version: VERSION, best: {}, layouts: {} };
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
        version: VERSION,
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
