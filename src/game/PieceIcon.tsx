import { PieceGlyph } from "./Board";
import { LivingIcon } from "./LivingGlyph";
import type { PieceKind } from "./types";

export function PieceIcon({ kind }: { kind: PieceKind }) {
  if (kind === "lamp" || kind === "trellis") return <LivingIcon kind={kind} />;
  if (kind === "window" || kind === "door" || kind === "alcove") {
    return (
      <svg viewBox="0 0 56 56" className="pg-piece-icon" aria-hidden="true" focusable="false">
        <path d="M9 13 38 6 47 11 47 45 18 52 9 47Z" fill="var(--pg-plaster)" />
        <path d="m38 6 9 5v34l-9-5Z" fill="var(--pg-plaster-2)" />
        {kind === "window" ? (
          <>
            <path d="m16 17 21-5v26l-21 5Z" className="pg-glass" />
            <path d="m16 17 21-5v26l-21 5Zm10.5-2.5v26M16 30l21-5" fill="none" stroke="var(--pg-wood-dark)" strokeWidth="2" />
          </>
        ) : kind === "door" ? (
          <>
            <path d="m17 22 19-5v29l-19 4Z" fill="var(--pg-wood)" />
            <path d="m17 22 19-5v29M21 25l11-3v11l-11 3Z" fill="none" stroke="var(--pg-wood-dark)" strokeWidth="2" />
            <circle cx="31" cy="37" r="1.6" fill="var(--pg-paper)" />
          </>
        ) : (
          <>
            <path d="m16 43 0-16q0-13 10-15t11 10v17Z" fill="var(--pg-plaster-2)" />
            <path d="m25 15 0 24 12 0V22q0-12-12-7" fill="var(--pg-wood-dark)" opacity="0.35" />
            <path d="m16 43 9-7 12 3-9 7Z" fill="var(--pg-floor)" />
          </>
        )}
      </svg>
    );
  }
  const frame = kind === "tree" ? "-26 -55 52 64" : kind === "gate" ? "-26 -42 52 54" : "-28 -40 56 56";
  return (
    <svg viewBox={frame} className="pg-piece-icon" aria-hidden="true" focusable="false">
      <PieceGlyph kind={kind} x={-0.5} y={-0.5} />
    </svg>
  );
}
