import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Eraser, Lightbulb, RotateCcw, Sparkles, X } from "lucide-react";
import { Board, type Target } from "@/game/Board";
import { LEVELS, evaluate } from "@/game/levels";
import type { Layout, Piece, PieceKind } from "@/game/types";
import { PIECE_LABELS, WALL_KINDS } from "@/game/types";
import { placeAt, removeAt } from "@/game/geometry";
import { retarget, spawn, step, type Inhabitant } from "@/game/inhabitants";
import { useProgress } from "@/game/progress";
import { PATTERNS } from "@/game/patterns";

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
  const navigate = useNavigate();
  const idx = LEVELS.findIndex((l) => l.slug === slug);
  const level = LEVELS[idx] ?? LEVELS[0];
  const progress = useProgress();

  const [pieces, setPieces] = useState<Piece[]>(() => progress.layoutFor(level.slug) ?? level.starting);
  const [tool, setTool] = useState<PieceKind | "erase" | null>(level.palette[0]?.kind ?? null);
  const [showLight, setShowLight] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  const [people, setPeople] = useState<Inhabitant[]>([]);

  const layout: Layout = { world: level.world, room: level.room, pieces };
  const evaluation = evaluate(level, layout);
  const pattern = PATTERNS.find((p) => p.number === level.number);
  const next = LEVELS[idx + 1];
  const prev = LEVELS[idx - 1];

  useEffect(() => {
    setPieces(progress.layoutFor(level.slug) ?? level.starting);
    setTool(level.palette[0]?.kind ?? null);
    setCelebrated(false);
    setMessage(null);
    setPeople(spawn({ world: level.world, room: level.room, pieces: [] }, level.inhabitants));
  }, [level.slug]);

  useEffect(() => {
    progress.record(level.slug, evaluation.score, layout);
    if (evaluation.score >= 100 && !celebrated) setCelebrated(true);
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

  function usedOf(kind: PieceKind) {
    return pieces.filter((p) => p.kind === kind).length;
  }

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
    if (usedOf(tool) >= entry.max) {
      setMessage(`You only have ${entry.max} ${PIECE_LABELS[tool].toLowerCase()}${entry.max === 1 ? "" : "s"} for this place.`);
      return;
    }
    const result = placeAt(level, pieces, tool, t);
    if (typeof result === "string") setMessage(result);
    else setPieces(result);
  }

  const score = evaluation.score;

  return (
    <main className="pg-play">
      <header className="pg-play-head">
        <Link to="/" className="pg-back">
          <ArrowLeft /> patterns
        </Link>
        <div className="pg-play-title">
          <span className="pg-num">{level.number}</span>
          <h1>{level.title}</h1>
        </div>
        <div className="pg-play-nav">
          {prev ? <button onClick={() => navigate(`/play/${prev.slug}`)} aria-label="Previous pattern"><ArrowLeft /></button> : <span />}
          {next ? <button onClick={() => navigate(`/play/${next.slug}`)} aria-label="Next pattern"><ArrowRight /></button> : <span />}
        </div>
      </header>

      <div className="pg-play-grid">
        <section className="pg-stage">
          <Board level={level} layout={layout} evaluation={evaluation} people={people} tool={tool} onTarget={handleTarget} showLight={showLight} />
          {message && (
            <div className="pg-toast" role="status">
              {message}
              <button onClick={() => setMessage(null)} aria-label="Dismiss"><X /></button>
            </div>
          )}
          {celebrated && score >= 100 && (
            <div className="pg-complete" role="status">
              <Sparkles />
              <div>
                <b>The pattern is alive.</b>
                <span>{level.completeLine}</span>
              </div>
              {next && (
                <button onClick={() => navigate(`/play/${next.slug}`)}>
                  next pattern <ArrowRight />
                </button>
              )}
            </div>
          )}
        </section>

        <aside className="pg-side">
          <div className="pg-score">
            <div className="pg-score-ring" style={{ ["--p" as string]: `${score}%` }}>
              <div className="pg-score-value">
                <span>{score}</span>
                <small>%</small>
              </div>
            </div>
            <div>
              <b>fulfilled</b>
              <p>{score >= 100 ? "Every check passes." : score >= 60 ? "Almost there. Look at what is still missing." : "Start placing pieces and watch the checks light up."}</p>
            </div>
          </div>

          <div className="pg-palette">
            <div className="pg-side-label">pieces</div>
            <div className="pg-palette-grid">
              {level.palette.map((p) => {
                const used = usedOf(p.kind);
                const active = tool === p.kind;
                return (
                  <button
                    key={p.kind}
                    className={`pg-tool ${active ? "is-active" : ""} ${used >= p.max ? "is-spent" : ""}`}
                    onClick={() => setTool(p.kind)}
                    aria-pressed={active}
                  >
                    <span className="pg-tool-name">{PIECE_LABELS[p.kind]}</span>
                    <span className="pg-tool-count">{used}/{p.max}</span>
                    <span className="pg-tool-where">{WALL_KINDS.has(p.kind) ? "wall" : "floor"}</span>
                  </button>
                );
              })}
              <button className={`pg-tool pg-tool-erase ${tool === "erase" ? "is-active" : ""}`} onClick={() => setTool("erase")} aria-pressed={tool === "erase"}>
                <Eraser /> <span className="pg-tool-name">remove</span>
              </button>
            </div>
            <div className="pg-palette-actions">
              <button className={`pg-chip ${showLight ? "is-on" : ""}`} onClick={() => setShowLight((v) => !v)} aria-pressed={showLight}>
                <Lightbulb /> daylight
              </button>
              <button className="pg-chip" onClick={() => { setPieces(level.starting); progress.reset(level.slug); setCelebrated(false); }}>
                <RotateCcw /> clear
              </button>
            </div>
          </div>

          <div className="pg-checks">
            <div className="pg-side-label">what the pattern asks</div>
            <ul>
              {evaluation.checks.map((c) => (
                <li key={c.id} className={c.ratio >= 1 ? "is-pass" : c.ratio > 0 ? "is-partial" : ""}>
                  <span className="pg-check-mark">{c.ratio >= 1 ? <Check /> : <i style={{ ["--r" as string]: c.ratio }} />}</span>
                  <div>
                    <b>{c.label}</b>
                    <p>{c.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <details className="pg-source">
            <summary>from the book</summary>
            <p className="pg-quote">{level.quote}</p>
            {pattern && (
              <p className="pg-meta">
                Pattern {pattern.number} · {pattern.section} · {pattern.subsection}
                {pattern.stars > 0 && <> · {"★".repeat(pattern.stars)}</>}
              </p>
            )}
          </details>
        </aside>
      </div>
    </main>
  );
}
