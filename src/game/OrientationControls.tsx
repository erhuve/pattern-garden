import type { CellPiece, Layout, Side } from "./types";
import { DirectionalGlyph } from "./DirectionalGlyph";
import { automaticFacing, FACINGS, FACING_LABELS, isFacing, resolveFacing } from "./orientation";
import "./orientation.css";

export function OrientationControls({ slug, layout, piece, onChange }: {
  slug: string; layout: Layout; piece: CellPiece; onChange: (direction: Side | "auto") => void;
}) {
  const current = resolveFacing(slug, layout, piece);
  const auto = automaticFacing(slug, layout, piece);
  const kind = piece.kind === "shelf" || piece.kind === "gate" || piece.kind === "bench" ? piece.kind : "seat";
  return <div className="pg-orientation">
    <p>Auto follows the room as you build. Choose a fixed direction if you want something different. {slug === "front-door-bench" && piece.kind === "bench" ? "This bench must face the street to satisfy the street-view criterion." : layout.scene === "overlooking-life" && piece.kind === "seat" ? "Both seats must face their windows to satisfy the view criterion." : layout.scene === "eating-atmosphere" && piece.kind === "seat" ? "Each chair must face the table to satisfy the dining criterion." : layout.scene === "garden-seat" && piece.kind === "bench" ? "The bench’s drawn direction determines its planted view, shelter and clear approach." : "Direction does not change your score."}</p>
    <button type="button" className="pg-auto-facing" aria-pressed={!isFacing(piece.facing)} onClick={() => onChange("auto")}>
      <strong>Auto</strong><span>{auto.reason}</span>
    </button>
    <div className="pg-facing-options" role="group" aria-label="Fixed direction">
      {FACINGS.map((direction) => <button key={direction} type="button" aria-label={`Face ${FACING_LABELS[direction].toLowerCase()}`}
        aria-pressed={piece.facing === direction} onClick={() => onChange(direction)}>
        <svg viewBox="-32 -45 64 68" aria-hidden="true" focusable="false"><DirectionalGlyph kind={kind} facing={direction} /></svg>
        <span>{FACING_LABELS[direction]}</span>
      </button>)}
    </div>
    <p className="pg-facing-status" role="status" aria-live="polite">{current.manual ? "Fixed" : "Auto"} · {FACING_LABELS[current.direction]} — {current.reason}</p>
  </div>;
}
