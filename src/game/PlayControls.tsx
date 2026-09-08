import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Check, ChevronRight, Eraser, Info, Lightbulb, RotateCcw, RotateCw, Sparkles, X } from "lucide-react";
import type { BoardTool, CheckResult, Evaluation, Level, Piece } from "./types";
import { PIECE_LABELS, WALL_KINDS } from "./types";
import { PieceIcon } from "./PieceIcon";

export function PlayDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLButtonElement>("button")?.focus();
    } else if (!open && dialog?.open) dialog.close();
  }, [open]);
  useEffect(() => {
    if (open && ref.current?.open) ref.current.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open, title]);

  return (
    <dialog ref={ref} className="pg-dialog" aria-labelledby="pg-dialog-title" onClose={onClose}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}>
      <header>
        <h2 id="pg-dialog-title">{title}</h2>
        <button type="button" className="pg-icon-button" onClick={onClose} aria-label="Close explanation" autoFocus><X /></button>
      </header>
      {children}
    </dialog>
  );
}

function checkStatus(check: CheckResult) {
  return check.ratio >= 1 ? "Met" : check.ratio > 0 ? "Partly met" : "Not yet met";
}

export function CriteriaPanel({ evaluation, onExplain, completeLine, onNext }: {
  evaluation: Evaluation;
  onExplain: (check: CheckResult) => void;
  completeLine: string;
  onNext?: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = evaluation.checks.find((check) => check.id === selectedId)
    ?? evaluation.checks.find((check) => check.ratio < 1)
    ?? evaluation.checks[0];
  const met = evaluation.checks.filter((check) => check.ratio >= 1).length;

  return (
    <aside className="pg-criteria" aria-labelledby="pg-criteria-title">
      <div className="pg-section-heading">
        <h2 id="pg-criteria-title">What the pattern asks</h2>
        <span aria-live="polite" aria-atomic="true">{met}/{evaluation.checks.length} met</span>
      </div>
      <ul className="pg-criteria-list">
        {evaluation.checks.map((check) => (
          <li key={check.id}>
            <button type="button" className={`pg-criterion ${check.ratio >= 1 ? "is-pass" : ""} ${check.id === selected?.id ? "is-selected" : ""}`}
              aria-label={`${check.label}. ${checkStatus(check)}. Show explanation`}
              aria-pressed={check.id === selected?.id}
              onClick={() => {
                setSelectedId(check.id);
                if (window.matchMedia("(max-width: 760px), (max-height: 600px)").matches || evaluation.score === 100) onExplain(check);
              }}>
              <span className="pg-check-mark" aria-hidden="true">
                {check.ratio >= 1 ? <Check /> : <i style={{ ["--r" as string]: check.ratio }} />}
              </span>
              <span>{check.label}</span>
              <ChevronRight className="pg-criterion-arrow" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {evaluation.score === 100 ? (
        <section className="pg-check-explanation pg-success" role="status">
          <Sparkles aria-hidden="true" />
          <h3>The pattern is alive.</h3>
          <p>{completeLine}</p>
          {onNext && <button type="button" className="pg-chip" onClick={onNext}>Next pattern <ArrowRight /></button>}
        </section>
      ) : selected && (
        <section className="pg-check-explanation" aria-label="Selected criterion explanation" aria-live="polite">
          <span className="pg-side-label">{checkStatus(selected)}</span>
          <h3>{selected.label}</h3>
          <p>{selected.detail}</p>
        </section>
      )}
      {evaluation.score < 100 && <p className="pg-criteria-hint">Select a check to see what it needs.</p>}
    </aside>
  );
}

export function BoardTools({ level, pieces, tool, onTool, showLight, onLight, onReset, onInfo }: {
  level: Level;
  pieces: Piece[];
  tool: BoardTool | null;
  onTool: (tool: BoardTool) => void;
  showLight: boolean;
  onLight: () => void;
  onReset: () => void;
  onInfo: () => void;
}) {
  return (
    <>
      <div className="pg-board-palette" role="group" aria-label="Building pieces. Counts show used inventory; extras are optional." style={{ ["--piece-total" as string]: level.palette.length + 2 }}>
        {level.palette.map((entry) => {
          const used = pieces.filter((piece) => piece.kind === entry.kind).length;
          return (
            <button key={entry.kind} type="button"
              className={`pg-tool pg-piece-tile ${tool === entry.kind ? "is-active" : ""} ${used >= entry.max ? "is-spent" : ""}`}
              onClick={() => onTool(entry.kind)} aria-pressed={tool === entry.kind}
              title={`${PIECE_LABELS[entry.kind]} · ${used}/${entry.max} used · ${WALL_KINDS.has(entry.kind) ? "Wall" : "Floor"}`}
              aria-label={`${PIECE_LABELS[entry.kind]}, ${used} of ${entry.max} used, place on ${WALL_KINDS.has(entry.kind) ? "wall" : "floor"}`}>
              <PieceIcon kind={entry.kind} />
              <span className="pg-tool-count" aria-hidden="true">{used}/{entry.max}</span>
            </button>
          );
        })}
        <button type="button" className={`pg-tool pg-piece-tile ${tool === "rotate" ? "is-active" : ""}`}
          onClick={() => onTool("rotate")} aria-pressed={tool === "rotate"} aria-label="Rotate" title="Auto or fixed direction"><RotateCw aria-hidden="true" /></button>
        <button type="button" className={`pg-tool pg-piece-tile pg-tool-erase ${tool === "erase" ? "is-active" : ""}`}
          onClick={() => onTool("erase")} aria-pressed={tool === "erase"} aria-label="Remove" title="Remove a piece"><Eraser aria-hidden="true" /></button>
      </div>
      <p className="pg-placement-hint" aria-live="polite" aria-atomic="true">
        <strong>{tool === "rotate" ? "Rotate" : tool === "erase" ? "Remove" : tool ? PIECE_LABELS[tool] : "Select a piece"}</strong>
        <span>{tool === "rotate" ? "Tap a seat, shelf or gate" : tool === "erase" ? "Tap a piece" : tool && WALL_KINDS.has(tool) ? "Tap a wall" : "Tap a floor tile"}</span>
      </p>
      <div className="pg-board-actions" role="group" aria-label="Board controls">
        <button type="button" className={`pg-icon-button ${showLight ? "is-on" : ""}`} onClick={onLight} aria-pressed={showLight} aria-label="Daylight" title="Show daylight"><Lightbulb aria-hidden="true" /></button>
        <button type="button" className="pg-icon-button" onClick={onReset} aria-label="Reset" title="Reset this layout"><RotateCcw aria-hidden="true" /></button>
        <button type="button" className="pg-icon-button" onClick={onInfo} aria-label="About this pattern" title="About this pattern"><Info aria-hidden="true" /></button>
      </div>
    </>
  );
}
