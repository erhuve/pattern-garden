import { useMemo, useRef, useState } from "react";
import type { BoardTool, Cell, Evaluation, Layout, Level, PieceKind, Side, WallPiece } from "./types";
import { DirectionalGlyph } from "./DirectionalGlyph";
import { resolveFacing } from "./orientation";
import { alcoveAt, interiorCell, wallLength, type PlaceTarget } from "./geometry";
import "./window-details.css";
import { lightCount } from "./levels";
import type { Inhabitant } from "./inhabitants";

export type Target = PlaceTarget;

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

function facePoly(seg: WallSeg, h: number): P[] {
  return [seg.a, seg.b, { x: seg.b.x, y: seg.b.y - h }, { x: seg.a.x, y: seg.a.y - h }];
}

function pointInPoly(pt: P, poly: P[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > pt.y !== b.y > pt.y && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segDist(pt: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2));
  return Math.hypot(a.x + dx * t - pt.x, a.y + dy * t - pt.y);
}

function polyDist(pt: P, poly: P[]): number {
  if (pointInPoly(pt, poly)) return 0;
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(pt, poly[i], poly[(i + 1) % poly.length]));
  return d;
}

function cellAt(pt: P, world: { w: number; h: number }): Cell | null {
  const x = Math.floor(pt.x / TW + pt.y / TH);
  const y = Math.floor(pt.y / TH - pt.x / TW);
  if (x < 0 || y < 0 || x >= world.w || y >= world.h) return null;
  return { x, y };
}

const SNAP = 26;

function outward(side: Side): Cell {
  return side === "n" ? { x: 0, y: -1 } : side === "s" ? { x: 0, y: 1 } : side === "w" ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

type Props = {
  level: Level;
  layout: Layout;
  evaluation: Evaluation;
  people: Inhabitant[];
  tool: BoardTool | null;
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
  const unhappySeats = new Set((evaluation.unhappy ?? []).map((c) => `${c.x},${c.y}`));

  const isHoverCell = (x: number, y: number) => hover?.type === "cell" && hover.x === x && hover.y === y;
  const isHoverWall = (s: Side, pos: number) => hover?.type === "wall" && hover.side === s && hover.pos === pos;
  const wallTool = tool === "window" || tool === "door" || tool === "alcove";
  const svgRef = useRef<SVGSVGElement>(null);

  function toSvgPoint(e: React.MouseEvent): P | null {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(ctm.inverse());
    return { x: q.x, y: q.y };
  }

  function nearestWall(pt: P, onlyWithPiece: boolean): { seg: WallSeg; d: number } | null {
    let best: { seg: WallSeg; d: number } | null = null;
    for (const seg of segs) {
      if (onlyWithPiece && !wallMap.has(`${seg.side}${seg.pos}`)) continue;
      const piece = wallMap.get(`${seg.side}${seg.pos}`);
      const h = piece?.kind === "door" ? WALL_H : Math.max(seg.front ? KNEE_H : WALL_H, 30);
      const d = polyDist(pt, facePoly(seg, h));
      if (!best || d < best.d) best = { seg, d };
    }
    return best;
  }

  const facings = useMemo(() => new Map(layout.pieces.flatMap((p) => "side" in p ? [] : [[`${p.x},${p.y}`, resolveFacing(level.slug, layout, p)] as const])), [level.slug, layout.pieces, layout.room, layout.world]);

  const floorPieceAt = (c: Cell) => layout.pieces.some((p) => !("side" in p) && p.x === c.x && p.y === c.y);

  function resolveTarget(pt: P): Target | null {
    if (tool === "rotate") {
      const cell = cellAt(pt, world);
      return cell ? { type: "cell", ...cell } : null;
    }
    const cell = cellAt(pt, world);
    if (tool === "erase") {
      if (cell && floorPieceAt(cell)) return { type: "cell", x: cell.x, y: cell.y };
      const w = nearestWall(pt, true);
      if (w && w.d <= 10) return { type: "wall", side: w.seg.side, pos: w.seg.pos };
    } else if (wallTool) {
      const w = nearestWall(pt, false);
      if (w && w.d <= SNAP) return { type: "wall", side: w.seg.side, pos: w.seg.pos };
    }
    if (cell) return { type: "cell", x: cell.x, y: cell.y };
    const w = nearestWall(pt, false);
    if (w && w.d <= SNAP) return { type: "wall", side: w.seg.side, pos: w.seg.pos };
    return null;
  }

  const downAt = useRef<{ x: number; y: number } | null>(null);

  function handlePointer(e: React.MouseEvent<SVGSVGElement>, commit: boolean) {
    const pt = toSvgPoint(e);
    if (!pt) return;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const element = hit && e.currentTarget.contains(hit) ? hit : null;
    if (!element) return;
    const paintedPiece = tool === "rotate" ? element?.closest<SVGGElement>("[data-piece-cell]") : null;
    const paintedWall = !element?.classList.contains("pg-floor") ? element?.closest<SVGGElement>("[data-wall-surface]") : null;
    const wallKey = paintedWall?.dataset.wallSurface;
    const directWall: Target | null = wallKey ? { type: "wall", side: wallKey[0] as Side, pos: Number(wallKey.slice(1)) } : null;
    const sillPlant = element?.closest("[data-sill-plant]");
    const cell = paintedPiece?.dataset.pieceCell?.split(",").map(Number);
    const t: Target | null = tool === "rotate"
      ? cell ? { type: "cell", x: cell[0], y: cell[1] } : paintedWall ? null : resolveTarget(pt)
      : directWall && (wallTool || tool === "plant" || tool === "erase" || paintedWall?.querySelector("[data-full-door]"))
        ? tool === "erase" && sillPlant ? { ...directWall, type: "sill" } : directWall
        : resolveTarget(pt);
    setHover(t);
    if (commit && t) onTarget(t);
  }

  const ground: React.ReactNode[] = [];
  for (let y = 0; y < world.h; y++)
    for (let x = 0; x < world.w; x++) {
      const insideRoom = x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
      const inside = insideRoom || Boolean(alcoveAt(room, layout.pieces, { x, y }));
      const lit = inside && showLight ? lightCount(layout, { x, y }) : 0;
      const isA = attract.has(`${x},${y}`);
      const unhappy = unhappySeats.has(`${x},${y}`);
      ground.push(
        <g key={`c${x}-${y}`}>
          <polygon points={diamond(x, y)} className={inside ? "pg-floor" : "pg-grass"} />
          {lit > 0 && <polygon points={diamond(x, y)} className="pg-light" style={{ opacity: Math.min(0.55, 0.22 * lit) }} />}
          {unhappy && <polygon points={diamond(x, y)} className="pg-unhappy" />}
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
    const h = piece?.kind === "door" ? WALL_H : seg.front ? KNEE_H : WALL_H;
    const hovered = isHoverWall(seg.side, seg.pos) && (wallTool || tool === "erase" || tool === "plant" && piece?.kind === "window");
    const mid = { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 };
    const dir = { x: seg.b.x - seg.a.x, y: seg.b.y - seg.a.y };
    const lerp = (t: number, z: number): P => ({ x: seg.a.x + dir.x * t, y: seg.a.y + dir.y * t - z });
    const shade = seg.side === "n" || seg.side === "s" ? "pg-wall-a" : "pg-wall-b";
    return (
      <g key={`w${seg.side}${seg.pos}`} className="pg-wallseg" data-wall-surface={`${seg.side}${seg.pos}`}>
        {piece?.kind === "door" ? (
          <g data-full-door={`${seg.side}${seg.pos}`}>
            <polygon points={poly([seg.a, lerp(0.18, 0), lerp(0.18, h), lerp(0, h)])} className={shade} />
            <polygon points={poly([lerp(0.82, 0), seg.b, lerp(1, h), lerp(0.82, h)])} className={shade} />
            <polygon points={poly([lerp(0.18, h - 5), lerp(0.82, h - 5), lerp(0.82, h), lerp(0.18, h)])} className={shade} />
            <polygon points={poly([lerp(0.2, 1), lerp(0.8, 1), lerp(0.8, h - 5), lerp(0.2, h - 5)])} className="pg-door" />
            <polygon points={poly([lerp(0.29, 23), lerp(0.71, 23), lerp(0.71, h - 10), lerp(0.29, h - 10)])} className="pg-door-panel" />
            <polygon points={poly([lerp(0.29, 6), lerp(0.71, 6), lerp(0.71, 17), lerp(0.29, 17)])} className="pg-door-panel" />
            <circle cx={lerp(0.71, 20).x} cy={lerp(0.71, 20).y} r={1.6} className="pg-door-knob" />
          </g>
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
        />
        {piece?.kind === "window" && <g className="pg-sill" data-sill={`${seg.side}${seg.pos}`}>
          <polyline points={poly([lerp(0.15, seg.front ? h : 14), lerp(0.85, seg.front ? h : 14)])} className="pg-window-sill" />
          {piece.sillPlant && <g data-sill-plant={`${seg.side}${seg.pos}`} transform={`translate(${lerp(0.5, seg.front ? h : 14).x} ${lerp(0.5, seg.front ? h : 14).y})`}>
            <polygon points="-6,-5 6,-5 4,0 -4,0" className="pg-sill-pot" />
            <ellipse cx={0} cy={-10} rx={3.3} ry={5.5} className="pg-sill-leaf" />
            <ellipse cx={-4} cy={-8} rx={3.5} ry={2.8} className="pg-sill-leaf" />
            <ellipse cx={4} cy={-8} rx={3.5} ry={2.8} className="pg-sill-leaf" />
          </g>}
        </g>}
        {hovered && <circle cx={mid.x} cy={mid.y - h / 2} r={3} className="pg-hover-dot" />}
      </g>
    );
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
      className={`pg-board ${tool === "rotate" ? "is-rotating" : ""}`}
      role="img"
      aria-label={`${level.title} board`}
      onPointerMove={(e) => {
        const d = downAt.current;
        if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) downAt.current = null;
        if (e.pointerType === "mouse") handlePointer(e, false);
      }}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => { downAt.current = null; }}
      onPointerDown={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={(e) => {
        const d = downAt.current;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) downAt.current = null;
      }}
      onClick={(e) => {
        const d = downAt.current;
        downAt.current = null;
        if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 12) return;
        handlePointer(e, true);
      }}
    >
      <g>{ground}</g>
      <g>{backWalls.map(renderWall)}</g>
      <g>
        {sortedPieces.flatMap((p, i) =>
          "side" in p ? [] : [<PieceGlyph key={`p${i}`} kind={p.kind} x={p.x} y={p.y} facing={facings.get(`${p.x},${p.y}`)?.direction} manual={facings.get(`${p.x},${p.y}`)?.manual} />],
        )}
        {people.map((h) => (
          <Person key={h.id} p={h} />
        ))}
      </g>
      <g>{frontWalls.map(renderWall)}</g>
    </svg>
  );
}

function AlcoveBay({ seg, h, shade }: { seg: WallSeg; h: number; shade: string }) {
  const o = outward(seg.side);
  const d = iso(o.x, o.y);
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

export function PieceGlyph({ kind, x, y, facing = "s", manual = false }: { kind: PieceKind; x: number; y: number; facing?: Side; manual?: boolean }) {
  const c = iso(x + 0.5, y + 0.5);
  if (kind === "seat" || kind === "shelf" || kind === "gate") {
    return <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`} data-facing-cell={`${x},${y}`} data-facing={facing} data-facing-mode={manual ? "manual" : "auto"} data-kind={kind}>
      <DirectionalGlyph kind={kind} facing={facing} />
    </g>;
  }
  switch (kind) {
    case "table":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`}>
          <polygon points={poly([iso(-0.4, -0.4, 16), iso(0.4, -0.4, 16), iso(0.4, 0.4, 16), iso(-0.4, 0.4, 16)])} className="pg-wood" />
          <polygon points={poly([iso(-0.4, 0.4, 16), iso(0.4, 0.4, 16), iso(0.4, 0.4, 13), iso(-0.4, 0.4, 13)])} className="pg-wood-dark" />
          <polygon points={poly([iso(0.4, -0.4, 16), iso(0.4, 0.4, 16), iso(0.4, 0.4, 13), iso(0.4, -0.4, 13)])} className="pg-wood-dark" />
          <line x1={iso(-0.32, 0.32).x} y1={iso(-0.32, 0.32).y} x2={iso(-0.32, 0.32, 13).x} y2={iso(-0.32, 0.32, 13).y} className="pg-leg" />
          <line x1={iso(0.32, 0.32).x} y1={iso(0.32, 0.32).y} x2={iso(0.32, 0.32, 13).x} y2={iso(0.32, 0.32, 13).y} className="pg-leg" />
        </g>
      );
    case "hearth":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`}>
          <polygon points={poly([iso(-0.4, -0.4, 0), iso(0.4, -0.4, 0), iso(0.4, 0.4, 0), iso(-0.4, 0.4, 0)])} className="pg-stone" />
          <polygon points={poly([iso(-0.3, -0.3, 0), iso(0.3, -0.3, 0), iso(0.3, 0.3, 0), iso(-0.3, 0.3, 0)])} className="pg-ember" />
          <path d={`M ${iso(0, 0, 4).x} ${iso(0, 0, 4).y} q -6 -8 0 -16 q 6 8 0 16`} className="pg-flame" />
          <path d={`M ${iso(0, 0, 6).x - 5} ${iso(0, 0, 6).y} q -3 -5 1 -9 q 3 5 -1 9`} className="pg-flame-2" />
        </g>
      );
    case "plant":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`}>
          <polygon points={poly([iso(-0.18, -0.18, 0), iso(0.18, -0.18, 0), iso(0.18, 0.18, 0), iso(-0.18, 0.18, 0)])} className="pg-pot" />
          <polygon points={poly([iso(-0.18, 0.18, 0), iso(0.18, 0.18, 0), iso(0.18, 0.18, 7), iso(-0.18, 0.18, 7)])} className="pg-pot" />
          <circle cx={0} cy={-14} r={7} className="pg-leaf" />
          <circle cx={-5} cy={-10} r={5} className="pg-leaf-2" />
          <circle cx={6} cy={-11} r={5} className="pg-leaf-2" />
        </g>
      );
    case "tree":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`}>
          <line x1={0} y1={0} x2={0} y2={-26} className="pg-trunk" />
          <circle cx={0} cy={-36} r={16} className="pg-canopy" />
          <circle cx={-10} cy={-28} r={11} className="pg-canopy-2" />
          <circle cx={10} cy={-29} r={11} className="pg-canopy-2" />
        </g>
      );
    case "path":
      return (
        <g transform={`translate(${c.x} ${c.y})`} className="pg-piece" data-piece-cell={`${x},${y}`}>
          <ellipse cx={-8} cy={-2} rx={7} ry={3.5} className="pg-stone" />
          <ellipse cx={7} cy={3} rx={7} ry={3.5} className="pg-stone" />
          <ellipse cx={2} cy={-6} rx={5} ry={2.5} className="pg-stone" />
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
