import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Board, type Target } from "@/game/Board";
import { CompletionCelebration } from "@/game/CompletionCelebration";
import { BoardTools, CriteriaPanel, PlayDialog } from "@/game/PlayControls";
import { LEVELS, evaluate } from "@/game/levels";
import type { BoardTool, Cell, Layout, Piece } from "@/game/types";
import { OrientationControls } from "@/game/OrientationControls";
import { isDirectional, setFacing } from "@/game/orientation";
import { PIECE_LABELS, WALL_KINDS } from "@/game/types";
import { placeAt, removeAt, usedInventory } from "@/game/geometry";
import { retarget, spawn, step, type Inhabitant } from "@/game/inhabitants";
import { useProgress } from "@/game/progress";
import { PATTERNS } from "@/game/patterns";
import "./play-layout.css";
import "./board-tools.css";

function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function Play() {
  const { slug } = useParams();
  const idx = Math.max(0, LEVELS.findIndex((level) => level.slug === slug));
  return <PlayLevel key={LEVELS[idx].slug} idx={idx} />;
}

function PlayLevel({ idx }: { idx: number }) {
  const navigate = useNavigate();
  const level = LEVELS[idx];
  const progress = useProgress();
  const [pieces, setPieces] = useState<Piece[]>(() => progress.layoutFor(level.slug) ?? level.starting);
  const [tool, setTool] = useState<BoardTool | null>(level.palette[0]?.kind ?? null);
  const [showLight, setShowLight] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "about" } | { kind: "check"; id: string } | { kind: "orientation"; cell: Cell } | { kind: "objects" } | { kind: "remove-window"; target: Extract<Target, { type: "wall" }> } | null>(null);
  const [people, setPeople] = useState<Inhabitant[]>(() => spawn({ ...level, pieces }, level.inhabitants));

  const layout = useMemo<Layout>(() => ({ ...level, pieces }), [level, pieces]);
  const evaluation = useMemo(() => evaluate(level, layout), [level, layout]);
  const pattern = PATTERNS.find((p) => p.number === level.number);
  const next = LEVELS[idx + 1];
  const prev = LEVELS[idx - 1];

  useEffect(() => {
    progress.record(level.slug, evaluation.score, layout);
  }, [evaluation.score, pieces]);

  const rng = useRef(mulberry(7));
  const layoutRef = useRef(layout);
  const attractorsRef = useRef(evaluation.attractors);
  useEffect(() => {
    layoutRef.current = layout;
    attractorsRef.current = evaluation.attractors;
  });
  const attractorsKey = evaluation.attractors.map((c) => `${c.x},${c.y}`).join("|");
  const obstacleKey = level.obstacleAware ? JSON.stringify(pieces.map(({ facing: _facing, ...piece }: Piece & { facing?: unknown }) => piece)) : "";
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let sinceRetarget = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      sinceRetarget += dt;
      setPeople((ps) => {
        let out = step(ps, dt);
        if (sinceRetarget > 2.4) {
          sinceRetarget = 0;
          out = retarget(layoutRef.current, out, attractorsRef.current, rng.current);
        }
        return out;
      });
      raf = requestAnimationFrame(loop);
    };
    setPeople((ps) => retarget(layoutRef.current, ps, attractorsRef.current, rng.current));
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [attractorsKey, pieces.length, level.slug, obstacleKey]);

  function handleTarget(t: Target) {
    setMessage(null);
    if (!tool) return;
    if (tool === "rotate") {
      const piece = t.type === "cell" ? pieces.find((p) => isDirectional(p) && p.x === t.x && p.y === t.y) : undefined;
      if (piece && isDirectional(piece)) setDialog({ kind: "orientation", cell: piece });
      else setMessage("Tap a seat, bench, shelf or gate to choose its direction. Other pieces do not need rotation.");
      return;
    }
    if (tool === "erase") {
      if (t.type !== "cell" && pieces.some((p) => p.kind === "window" && p.sillPlant && p.side === t.side && p.pos === t.pos)) {
        setDialog({ kind: "remove-window", target: { type: "wall", side: t.side, pos: t.pos } });
      } else setPieces((ps) => removeAt(level, ps, t));
      return;
    }
    const entry = level.palette.find((p) => p.kind === tool);
    if (!entry) return;
    const wallKind = WALL_KINDS.has(tool);
    if (wallKind && t.type !== "wall") {
      setMessage(`${PIECE_LABELS[tool]} goes on a wall — tap the edge of the room.`);
      return;
    }
    if (!wallKind && tool !== "plant" && t.type !== "cell") {
      setMessage(`${PIECE_LABELS[tool]} goes on the ground — tap a free tile.`);
      return;
    }
    if (usedInventory(pieces, tool) >= entry.max) {
      setMessage(`You only have ${entry.max} ${PIECE_LABELS[tool].toLowerCase()}${entry.max === 1 ? "" : "s"} for this place.`);
      return;
    }
    const result = placeAt(level, pieces, tool, t);
    if (typeof result === "string") setMessage(result);
    else setPieces(result);
  }

  const orientedPiece = dialog?.kind === "orientation" ? pieces.find((p) => isDirectional(p) && p.x === dialog.cell.x && p.y === dialog.cell.y) : undefined;
  const score = evaluation.score;
  const explainedCheck = dialog?.kind === "check" ? evaluation.checks.find((check) => check.id === dialog.id) : undefined;

  return (
    <main className={`pg-play pg-workbench${level.adaptation ? " pg-expanded" : ""}`}>
      <header className="pg-play-head">
        <Link to="/" className="pg-back" aria-label="All patterns"><ArrowLeft /><span>patterns</span></Link>
        <div className="pg-play-title">
          <span className="pg-num">{level.number}</span>
          <h1>{level.title}</h1>
        </div>
        <div className="pg-header-tools">
          <div className="pg-score" role="status" aria-label={`${score}% fulfilled`} aria-live="polite" aria-atomic="true">
            <div className="pg-score-ring" style={{ ["--p" as string]: `${score}%` }} aria-hidden="true">
              <div className="pg-score-value"><span>{score}</span><small>%</small></div>
            </div>
            <span className="pg-score-caption">{score === 100 ? "alive" : "fulfilled"}</span>
          </div>
          <nav className="pg-play-nav" aria-label="Pattern navigation">
            {prev && <button onClick={() => navigate(`/play/${prev.slug}`)} aria-label="Previous pattern"><ArrowLeft /></button>}
            {next && <button onClick={() => navigate(`/play/${next.slug}`)} aria-label="Next pattern"><ArrowRight /></button>}
          </nav>
        </div>
      </header>
      <div className="pg-play-grid">
        <section className="pg-stage" aria-label="Building board" style={{ ["--piece-total" as string]: level.palette.length + 2 }}>
          <div className="pg-board-viewport">
            <Board level={level} layout={layout} evaluation={evaluation} people={people} tool={tool} onTarget={handleTarget} showLight={showLight} />
            <CompletionCelebration complete={score === 100} />
          </div>
          <BoardTools level={level} pieces={pieces} tool={tool} onTool={(kind) => { setTool(kind); setMessage(null); if (kind === "rotate") setDialog({ kind: "objects" }); }}
            showLight={showLight} onLight={() => setShowLight((value) => !value)}
            onReset={() => { setPieces(level.starting); progress.reset(level.slug); setMessage(null); }}
            onInfo={() => setDialog({ kind: "about" })} />
          {message && (
            <div className="pg-toast" role="status">
              {message}
              <button onClick={() => setMessage(null)} aria-label="Dismiss"><X /></button>
            </div>
          )}
        </section>
        <CriteriaPanel evaluation={evaluation} completeLine={level.completeLine} explainOnTap={Boolean(level.adaptation)}
          onNext={next ? () => navigate(`/play/${next.slug}`) : undefined}
          onExplain={(check) => setDialog({ kind: "check", id: check.id })} />
      </div>
      <PlayDialog open={dialog !== null} onClose={() => setDialog(null)} title={dialog?.kind === "remove-window" ? "Remove from this window" : dialog?.kind === "objects" ? "Choose a piece to turn" : orientedPiece ? `Turn ${PIECE_LABELS[orientedPiece.kind].toLowerCase()}` : explainedCheck?.label ?? "About this pattern"}>
        {dialog?.kind === "remove-window" ? (
          <div className="pg-object-chooser">
            <p>Keep the window and remove its plant, or remove both.</p>
            <button type="button" onClick={() => { setPieces((ps) => removeAt(level, ps, { ...dialog.target, type: "sill" })); setDialog(null); }}>Remove plant only</button>
            <button type="button" onClick={() => { setPieces((ps) => removeAt(level, ps, dialog.target)); setDialog(null); }}>Remove window and plant</button>
          </div>
        ) : dialog?.kind === "objects" ? (
          <div className="pg-object-chooser">
            <p>Choose a piece below, or close this panel and tap one on the board. Auto is the default; fixed directions are optional.</p>
            {pieces.filter(isDirectional).sort((a, b) => a.y - b.y || a.x - b.x).map((piece) => (
              <button type="button" key={`${piece.x},${piece.y}`} onClick={() => setDialog({ kind: "orientation", cell: piece })}>
                {PIECE_LABELS[piece.kind]} · column {piece.x + 1}, row {piece.y + 1}
              </button>
            ))}
            {!pieces.some(isDirectional) && <p>Place a seat, bench, shelf or gate first. The other pieces do not need rotation.</p>}
          </div>
        ) : orientedPiece && isDirectional(orientedPiece) ? <OrientationControls slug={level.slug} layout={layout} piece={orientedPiece}
          onChange={(direction) => setPieces((ps) => setFacing(ps, orientedPiece, direction))} /> : explainedCheck ? (
          <>
            <p className="pg-meta">{explainedCheck.ratio >= 1 ? "Met" : explainedCheck.ratio > 0 ? "Partly met" : "Not yet met"}</p>
            <p>{explainedCheck.detail}</p>
          </>
        ) : (
          <>
            <p className="pg-quote">{level.quote}</p>
            {level.adaptation && <p className="pg-adaptation"><strong>This puzzle’s interpretation.</strong> {level.adaptation}</p>}
            <p>Piece counters show used / available inventory. Extras are optional; the criteria determine when the pattern is complete.</p>
            {pattern && <p className="pg-meta">Pattern {pattern.number} · {pattern.section} · {pattern.subsection}{pattern.stars > 0 && <> · {"★".repeat(pattern.stars)}</>}</p>}
            <nav className="pg-dialog-nav" aria-label="Browse patterns">
              {prev && <Link className="pg-chip" to={`/play/${prev.slug}`}><ArrowLeft />Previous pattern</Link>}
              {next && <Link className="pg-chip" to={`/play/${next.slug}`}>Next pattern<ArrowRight /></Link>}
              <Link className="pg-chip" to="/">All patterns</Link>
            </nav>
          </>
        )}
      </PlayDialog>
    </main>
  );
}
