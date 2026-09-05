import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Board, type Target } from "@/game/Board";
import { CriteriaPanel, PieceTray, PlayDialog } from "@/game/PlayControls";
import { LEVELS, evaluate } from "@/game/levels";
import type { Layout, Piece, PieceKind } from "@/game/types";
import { PIECE_LABELS, WALL_KINDS } from "@/game/types";
import { placeAt, removeAt } from "@/game/geometry";
import { retarget, spawn, step, type Inhabitant } from "@/game/inhabitants";
import { useProgress } from "@/game/progress";
import { PATTERNS } from "@/game/patterns";
import "./play-layout.css";

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
  const [tool, setTool] = useState<PieceKind | "erase" | null>(level.palette[0]?.kind ?? null);
  const [showLight, setShowLight] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "about" } | { kind: "check"; id: string } | null>(null);
  const [people, setPeople] = useState<Inhabitant[]>(() => spawn({ world: level.world, room: level.room, pieces: [] }, level.inhabitants));

  const layout: Layout = { world: level.world, room: level.room, pieces };
  const evaluation = evaluate(level, layout);
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
  }, [attractorsKey, pieces.length, level.slug]);

  function handleTarget(t: Target) {
    setMessage(null);
    if (!tool) return;
    if (tool === "erase") {
      setPieces((ps) => removeAt(level, ps, t));
      return;
    }
    const entry = level.palette.find((p) => p.kind === tool);
    if (!entry) return;
    const wallKind = WALL_KINDS.has(tool);
    if (wallKind && t.type !== "wall") {
      setMessage(`${PIECE_LABELS[tool]} goes on a wall — tap the edge of the room.`);
      return;
    }
    if (!wallKind && t.type !== "cell") {
      setMessage(`${PIECE_LABELS[tool]} goes on the floor — tap a tile inside the room.`);
      return;
    }
    if (pieces.filter((piece) => piece.kind === tool).length >= entry.max) {
      setMessage(`You only have ${entry.max} ${PIECE_LABELS[tool].toLowerCase()}${entry.max === 1 ? "" : "s"} for this place.`);
      return;
    }
    const result = placeAt(level, pieces, tool, t);
    if (typeof result === "string") setMessage(result);
    else setPieces(result);
  }

  const score = evaluation.score;
  const explainedCheck = dialog?.kind === "check" ? evaluation.checks.find((check) => check.id === dialog.id) : undefined;

  return (
    <main className="pg-play pg-workbench">
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
        <section className="pg-stage" aria-label="Building board">
          <Board level={level} layout={layout} evaluation={evaluation} people={people} tool={tool} onTarget={handleTarget} showLight={showLight} />
          {message && (
            <div className="pg-toast" role="status">
              {message}
              <button onClick={() => setMessage(null)} aria-label="Dismiss"><X /></button>
            </div>
          )}
        </section>
        <PieceTray level={level} pieces={pieces} tool={tool} onTool={(kind) => { setTool(kind); setMessage(null); }}
          showLight={showLight} onLight={() => setShowLight((value) => !value)}
          onReset={() => { setPieces(level.starting); progress.reset(level.slug); setMessage(null); }}
          onInfo={() => setDialog({ kind: "about" })} />
        <CriteriaPanel evaluation={evaluation} completeLine={level.completeLine}
          onNext={next ? () => navigate(`/play/${next.slug}`) : undefined}
          onExplain={(check) => setDialog({ kind: "check", id: check.id })} />
      </div>
      <PlayDialog open={dialog !== null} onClose={() => setDialog(null)} title={explainedCheck?.label ?? "About this pattern"}>
        {explainedCheck ? (
          <>
            <p className="pg-meta">{explainedCheck.ratio >= 1 ? "Met" : explainedCheck.ratio > 0 ? "Partly met" : "Not yet met"}</p>
            <p>{explainedCheck.detail}</p>
          </>
        ) : (
          <>
            <p className="pg-quote">{level.quote}</p>
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
