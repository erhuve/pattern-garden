import { useState } from "react";
import type { Cell, Evaluation, Layout, Level, PieceKind, Side, WallPiece } from "./types";
import { interiorCell, wallLength } from "./geometry";
import { lightCount } from "./levels";
import type { Inhabitant } from "./inhabitants";

export type Target = { type: "cell"; x: number; y: number } | { type: "wall"; side: Side; pos: number };

const TW = 60;
const TH = 30;
const WALL_H = 46;
const KNEE_H = 12;

type P = { x: number; y: number };

function iso(x: number, y: number, z = 0): P {
  return { x: ((x - y) * TW) / 2, y: ((x + y) * TH) / 2 - z };
}

function poly(points: P[]): string {
  return points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
}

function diamond(x: number, y: number, z = 0): string {
  return poly([iso(x, y, z), iso(x + 1, y, z), iso(x + 1, y + 1, z), iso(x, y + 1, z)]);
}

type WallSeg = { side: Side; pos: number; a: P; b: P; front: boolean };

function wallSegments(layout: Layout): WallSeg[] {
  const r = layout.room;
  const out: WallSeg[] = [];
  for (let i = 0; i < r.w; i++) {
    out.push({ side: "n", pos: i, a: iso(r.x + i, r.y), b: iso(r.x + i + 1, r.y), front: false });
    out.push({ side: "s", pos: i, a: iso(r.x + i, r.y + r.h), b: iso(r.x + i + 1, r.y + r.h), front: true });
  }
  for (let i = 0; i < r.h; i++) {
    out.push({ side: "w", pos: i, a: iso(r.x, r.y + i), b: iso(r.x, r.y + i + 1), front: false });
    out.push({ side: "e", pos: i, a: iso(r.x + r.w, r.y + i), b: iso(r.x + r.w, r.y + i + 1), front: true });
  }
  return out;
}

function wallFace(seg: WallSeg, h: number): string {
  return poly([seg.a, seg.b, { x: seg.b.x, y: seg.b.y - h }, { x: seg.a.x, y: seg.a.y - h }]);
}

function outward(side: Side): Cell {
  return side === "n" ? { x: 0, y: -1 } : side === "s" ? { x: 0, y: 1 } : side === "w" ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

type Props = {
  level: Level;
  layout: Layout;
  evaluation: Evaluation;
  people: Inhabitant[];
  tool: PieceKind | "erase" | null;
  onTarget: (t: Target) => void;
  showLight: boolean;
};

export function Board({ level, layout, evaluation, people, tool, onTarget, showLight }: Props) {
  const [hover, setHover] = useState<Target | null>(null);
  const { world, room } = layout;
  const segs = wallSegments(layout);
  const wallMap = new Map<string, WallPiece>();
  for (const p of layout.pieces) if ("side" in p) wallMap.set(`${p.side}${p.pos}`, p);

  const minX = iso(0, world.h).x - TW;
  const maxX = iso(world.w, 0).x + TW;
  const minY = -WALL_H - 40;
  const maxY = iso(world.w, world.h).y + 30;
  const attract = new Set(evaluation.attractors.map((c) => `${c.x},${c.y}`));

  const isHoverCell = (x: number, y: number) => hover?.type === "cell" && hover.x === x && hover.y === y;
  const isHoverWall = (s: Side, pos: number) => hover?.type === "wall" && hover.side === s && hover.pos === pos;
  const wallTool = tool === "window" || tool === "door" || tool === "alcove";

  const ground: React.ReactNode[] = [];
  for (let y = 0; y < world.h; y++)
    for (let x = 0; x < world.w; x++) {
      const inside = x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
      const lit = inside && showLight ? lightCount(layout, { x, y }) : 0;
      const isA = attract.has(`${x},${y}`);
      ground.push(
        <g key={`c${x}-${y}`}>
          <polygon points={diamond(x, y)} className={inside ? "pg-floor" : "pg-grass"} />
          {lit > 0 && <polygon points={diamond(x, y)} className="pg-light" style={{ opacity: Math.min(0.55, 0.22 * lit) }} />}
          {isA && <polygon points={diamond(x, y)} className="pg-attract" />}
          {isHoverCell(x, y) && tool && !wallTool && <polygon points={diamond(x, y)} className="pg-hover" />}
        </g>,
      );
    }

  const sortedPieces = [...layout.pieces].sort((a, b) => {
    const ka = "side" in a ? interiorCell(room, a) : a;
    const kb = "side" in b ? interiorCell(room, b) : b;
    return ka.x + ka.y - (kb.x + kb.y);
  });

  const backWalls = segs.filter((s) => !s.front);
  const frontWalls = segs.filter((s) => s.front);

  function renderWall(seg: WallSeg) {
    const piece = wallMap.get(`${seg.side}${seg.pos}`);
    const h = seg.front ? KNEE_H : WALL_H;
    const hovered = isHoverWall(seg.side, seg.pos) && (wallTool || tool === "erase");
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    const dir = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
    const lerp = (t: number, z: number): P => ({ x: seg.a.x + dir.x * t, y: seg.a.y + dir.y * t - z });
    const shade = seg.side === "n" || seg.side === "s" ? "pg-wall-a" : "pg-wall-b";
    return (
      <g key={`w${seg.side}${seg.pos}`} className="pg-wallseg">
        {piece?.kind === "door" ? (
          <>
            <polygon points={poly([seg.a, lerp(0.2, 0), lerp(0.2, h), lerp(0, h)])} className={shade} />
            <polygon points={poly([lerp(0.8, 0), seg.b, lerp(1, h), lerp(0.8, h)])} className={shade} />
            <polygon points={poly([lerp(0.2, h * 0.82), lerp(0.8, h * 0.82), lerp(0.8, h), lerp(0.2, h)])} className={shade} />
            <polygon points={poly([lerp(0.22, 0), lerp(0.78, 0), lerp(0.78, seg.front ? h : WALL_H * 0.8), lerp(0.22, seg.front ? h : WALL_H * 0.8)])} className="pg-door" />
          </>
        ) : piece?.kind === "alcove" ? (
          <AlcoveBay seg={seg} h={h} shade={shade} />
        ) : (
          <polygon points={wallFace(seg, h)} className={shade} />
        )}
        {piece?.kind === "window" && (
          <>
            <polygon
              points={poly([lerp(0.2, seg.front ? h : 14), lerp(0.8, seg.front ? h : 14), lerp(0.8, seg.front ? h + 22 : 36), lerp(0.2, seg.front ? h + 22 : 36)])}
              className="pg-glass"
            />
            <polyline points={poly([lerp(0.5, seg.front ? h : 14), lerp(0.5, seg.front ? h + 22 : 36)])} className="pg-mullion" />
          </>
        )}
        <polygon
          points={wallFace(seg, Math.max(h, 30))}
          className={`pg-wall-hit ${hovered ? "is-hover" : ""}`}
          data-wall={`${seg.side}${seg.pos}`}
          onMouseEnter={() => setHover({ type: "wall", side: seg.side, pos: seg.pos })}
          onMouseLeave={() => setHover(null)}
          onClick={() => onTarget({ type: "wall", side: seg.side, pos: seg.pos })}
        />
        {hovered && <circle cx={mid.x} cy={mid.y - h / 2} r={3} className="pg-hover-dot" />}
      </g>
    );
  }

  return (
    <svg
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className="pg-board"
      role="img"
      aria-label={`${level.title} board`}
    >
      <g>{ground}</g>
      <g>{backWalls.map(renderWall)}</g>
      <g>
        {sortedPieces.flatMap((p, i) =>
          "side" in p ? [] : [<PieceGlyph key={`p${i}`} kind={p.kind} x={p.x} y={p.y} />],
        )}
        {people.map((h) => (
          <Person key={h.id} p={h} />
        ))}
      </g>
      <g>{frontWalls.map(renderWall)}</g>
      <g>
        {Array.from({ length: world.h }, (_, y) =>
          Array.from({ length: world.w }, (_, x) => (
            <polygon
              key={`h${x}-${y}`}
              points={diamond(x, y)}
              className="pg-cell-hit"
              data-cell={`${x},${y}`}
              onMouseEnter={() => setHover({ type: "cell", x, y })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onTarget({ type: "cell", x, y })}
            />
          )),
        )}
      </g>
    </svg>
  );
}

function AlcoveBay({ seg, h, shade }: { seg: WallSeg; h: number; shade: string }) {
  const o = outward(seg.side);
  const d = iso(o.x * 0.7, o.y * 0.7);
  const shift = (p: P, z = 0): P => ({ x: p.x + d.x, y: p.y + d.y - z });
  const a2 = shift(seg.a);
  const b2 = shift(seg.b);
  return (
    <>
      <polygon points={poly([seg.a, a2, shift(seg.a, h), { x: seg.a.x, y: seg.a.y - h }])} className={shade === "pg-wall-a" ? "pg-wall-b" : "pg-wall-a"} />
      <polygon points={poly([seg.b, b2, shift(seg.b, h), { x: seg.b.x, y: seg.b.y - h }])} className={shade === "pg-wall-a" ? "pg-wall-b" : "pg-wall-a"} />
      <polygon points={poly([a2, b2, shift(seg.b, h), shift(seg.a, h)])} className={shade} />
      <polygon points={poly([shift(seg.a, h), shift(seg.b, h), { x: seg.b.x, y: seg.b.y - h }, { x: seg.a.x, y: seg.a.y - h }])} className="pg-roof" />
      <polygon points={poly([seg.a, seg.b, b2, a2])} className="pg-floor" />
    </>
  );
}

function PieceGlyph({ kind, x, y }: { kind: PieceKind; x: number; y: number }) {
  const c = iso(x + 0.5, y + 0.5);
  switch (kind) {
    case "seat":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <polygon points={poly([iso(-0.3, -0.3, 10), iso(0.3, -0.3, 10), iso(0.3, 0.3, 10), iso(-0.3, 0.3, 10)])} className="pg-seat" />
          <polygon points={poly([iso(-0.3, -0.3, 10), iso(0.3, -0.3, 10), iso(0.3, -0.3, 24), iso(-0.3, -0.3, 24)])} className="pg-seat-back" />
          <polygon points={poly([iso(-0.3, -0.3, 0), iso(-0.3, 0.3, 0), iso(-0.3, 0.3, 10), iso(-0.3, -0.3, 10)])} className="pg-seat-side" />
          <polygon points={poly([iso(-0.3, 0.3, 0), iso(0.3, 0.3, 0), iso(0.3, 0.3, 10), iso(-0.3, 0.3, 10)])} className="pg-seat-front" />
        </g>
      );
    case "table":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <polygon points={poly([iso(-0.4, -0.4, 16), iso(0.4, -0.4, 16), iso(0.4, 0.4, 16), iso(-0.4, 0.4, 16)])} className="pg-wood" />
          <polygon points={poly([iso(-0.4, 0.4, 16), iso(0.4, 0.4, 16), iso(0.4, 0.4, 13), iso(-0.4, 0.4, 13)])} className="pg-wood-dark" />
          <polygon points={poly([iso(0.4, -0.4, 16), iso(0.4, 0.4, 16), iso(0.4, 0.4, 13), iso(0.4, -0.4, 13)])} className="pg-wood-dark" />
          <line x1={iso(-0.32, 0.32).x} y1={iso(-0.32, 0.32).y} x2={iso(-0.32, 0.32, 13).x} y2={iso(-0.32, 0.32, 13).y} className="pg-leg" />
          <line x1={iso(0.32, 0.32).x} y1={iso(0.32, 0.32).y} x2={iso(0.32, 0.32, 13).x} y2={iso(0.32, 0.32, 13).y} className="pg-leg" />
        </g>
      );
    case "shelf":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <polygon points={poly([iso(-0.4, -0.4, 0), iso(0.4, -0.4, 0), iso(0.4, -0.4, 30), iso(-0.4, -0.4, 30)])} className="pg-wood" />
          <polygon points={poly([iso(0.4, -0.4, 0), iso(0.4, 0.1, 0), iso(0.4, 0.1, 30), iso(0.4, -0.4, 30)])} className="pg-wood-dark" />
          <polygon points={poly([iso(-0.4, -0.4, 30), iso(0.4, -0.4, 30), iso(0.4, 0.1, 30), iso(-0.4, 0.1, 30)])} className="pg-wood-light" />
          <line x1={iso(-0.4, -0.4, 10).x} y1={iso(-0.4, -0.4, 10).y} x2={iso(0.4, -0.4, 10).x} y2={iso(0.4, -0.4, 10).y} className="pg-leg" />
          <line x1={iso(-0.4, -0.4, 20).x} y1={iso(-0.4, -0.4, 20).y} x2={iso(0.4, -0.4, 20).x} y2={iso(0.4, -0.4, 20).y} className="pg-leg" />
        </g>
      );
    case "hearth":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <polygon points={poly([iso(-0.4, -0.4, 0), iso(0.4, -0.4, 0), iso(0.4, 0.4, 0), iso(-0.4, 0.4, 0)])} className="pg-stone" />
          <polygon points={poly([iso(-0.3, -0.3, 0), iso(0.3, -0.3, 0), iso(0.3, 0.3, 0), iso(-0.3, 0.3, 0)])} className="pg-ember" />
          <path d={`M ${iso(0, 0, 4).x} ${iso(0, 0, 4).y} q -6 -8 0 -16 q 6 8 0 16`} className="pg-flame" />
          <path d={`M ${iso(0, 0, 6).x - 5} ${iso(0, 0, 6).y} q -3 -5 1 -9 q 3 5 -1 9`} className="pg-flame-2" />
        </g>
      );
    case "plant":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <polygon points={poly([iso(-0.18, -0.18, 0), iso(0.18, -0.18, 0), iso(0.18, 0.18, 0), iso(-0.18, 0.18, 0)])} className="pg-pot" />
          <polygon points={poly([iso(-0.18, 0.18, 0), iso(0.18, 0.18, 0), iso(0.18, 0.18, 7), iso(-0.18, 0.18, 7)])} className="pg-pot" />
          <circle cx={0} cy={-14} r={7} className="pg-leaf" />
          <circle cx={-5} cy={-10} r={5} className="pg-leaf-2" />
          <circle cx={6} cy={-11} r={5} className="pg-leaf-2" />
        </g>
      );
    case "tree":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <line x1={0} y1={0} x2={0} y2={-26} className="pg-trunk" />
          <circle cx={0} cy={-36} r={16} className="pg-canopy" />
          <circle cx={-10} cy={-28} r={11} className="pg-canopy-2" />
          <circle cx={10} cy={-29} r={11} className="pg-canopy-2" />
        </g>
      );
    case "path":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <ellipse cx={-8} cy={-2} rx={7} ry={3.5} className="pg-stone" />
          <ellipse cx={7} cy={3} rx={7} ry={3.5} className="pg-stone" />
          <ellipse cx={2} cy={-6} rx={5} ry={2.5} className="pg-stone" />
        </g>
      );
    case "gate":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece">
          <line x1={-14} y1={4} x2={-14} y2={-26} className="pg-post" />
          <line x1={14} y1={-4} x2={14} y2={-34} className="pg-post" />
          <line x1={-14} y1={-24} x2={14} y2={-32} className="pg-post" />
          <line x1={-8} y1={-8} x2={-8} y2={-20} className="pg-picket" />
          <line x1={0} y1={-10} x2={0} y2={-22} className="pg-picket" />
          <line x1={8} y1={-12} x2={8} y2={-24} className="pg-picket" />
        </g>
      );
    default:
      return null;
  }
}

function Person({ p }: { p: Inhabitant }) {
  const c = iso(p.x + 0.5, p.y + 0.5);
  return (
    <g transform={`translate(${c.x} ${c.y})`} className={`pg-person ${p.mood ? "is-content" : ""}`}>
      <ellipse cx={0} cy={0} rx={6} ry={3} className="pg-shadow" />
      <rect x={-4} y={-16} width={8} height={12} rx={3} className="pg-body" />
      <circle cx={0} cy={-20} r={4.5} className="pg-head" />
      {p.mood > 0 && (
        <g className="pg-note">
          <path d="M 4 -30 q 0 -4 3 -4 q 3 0 3 3 q 0 3 -3 6 q -3 -3 -3 -5 z" transform="translate(4 -2) scale(0.9)" />
        </g>
      )}
    </g>
  );
}

export function wallCount(layout: Layout, side: Side): number {
  return wallLength(layout.room, side);
}
