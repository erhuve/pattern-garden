import type { JSX } from "react";
import "./living-art.css";

type LivingKind = "lamp" | "trellis";
type Point = readonly [number, number, number];
type Layer = "back" | "front" | "all";
const iso = (x: number, y: number, z = 0) => ({ x: (x - y) * 30, y: (x + y) * 15 - z });
const points = (...vertices: Point[]) => vertices.map(([x, y, z]) => {
  const p = iso(x, y, z);
  return `${p.x},${p.y}`;
}).join(" ");
const corners = [
  { name: "rear", x: -0.4, y: -0.4 },
  { name: "left", x: -0.4, y: 0.4 },
  { name: "right", x: 0.4, y: -0.4 },
  { name: "front", x: 0.4, y: 0.4 },
] as const;

export function LampGlyph(): JSX.Element {
  return <g className="pg-living-glyph pg-lamp" data-living-kind="lamp" pointerEvents="none" aria-hidden="true">
    <g className="pg-lamp-pool" data-light-height="16">
      <ellipse cx="0" cy="-16" rx="15" ry="6" />
      <ellipse className="pg-lamp-pool-core" cx="0" cy="-16" rx="9" ry="3.5" />
    </g>
    <path className="pg-lamp-cord" d="M0-60V-52" />
    <ellipse className="pg-lamp-ceiling-cap" cx="0" cy="-60" rx="2.2" ry="0.9" />
    <g data-shade-height="43">
      <path className="pg-lamp-shade" d="M-3.5-52Q0-53.8 3.5-52L10-43Q0-39-10-43Z" />
      <path className="pg-lamp-shade-fold" d="M-1.8-51-5-43.5M1.8-51 5-43.5" />
      <ellipse className="pg-lamp-shade-top" cx="0" cy="-52" rx="3.5" ry="1.1" />
      <ellipse className="pg-lamp-light" cx="0" cy="-43" rx="9.5" ry="2.3" />
      <ellipse className="pg-lamp-bulb" cx="0" cy="-42.5" rx="2" ry="1" />
    </g>
  </g>;
}

function Leaf({ x, y, angle, light = false }: { x: number; y: number; angle: number; light?: boolean }) {
  return <g transform={`translate(${x} ${y}) rotate(${angle}) scale(0.9)`}>
    <path className={light ? "pg-trellis-leaf-light" : "pg-trellis-leaf"} d="M0 0Q-1.6-5.3 2.3-7.4Q5.2-2.7 0 0Z" />
    <path className="pg-trellis-leaf-vein" d="M0 0 2-5.5" />
  </g>;
}

function TrellisPost({ corner, planted }: { corner: typeof corners[number]; planted: boolean }) {
  const { x, y, name } = corner;
  const r = 0.026;
  const base = iso(x, y);
  return <g data-trellis-post={name}>
    <polygon className="pg-trellis-post" points={points([x - r, y + r, 0], [x + r, y + r, 0], [x + r, y + r, 40], [x - r, y + r, 40])} />
    <polygon className="pg-trellis-post-side" points={points([x + r, y - r, 0], [x + r, y + r, 0], [x + r, y + r, 40], [x + r, y - r, 40])} />
    {planted && <g className="pg-trellis-vine" transform={`translate(${base.x} ${base.y})`}>
      <path className="pg-trellis-vine-stem" d="M0 0C-2-5 2-8 0-13S-2-20 0-25 2-34 0-40" />
      {[8, 20, 32].map((height, i) => <Leaf key={height} x={0} y={-height} angle={i % 2 ? -54 : 56} light={i % 2 === 0} />)}
    </g>}
  </g>;
}

function TrellisRoof({ planted }: { planted: boolean }) {
  return <g data-trellis-roof="true" data-roof-height="40">
    <polyline className="pg-trellis-beam-back" points={points([-0.4, 0.4, 40], [-0.4, -0.4, 40], [0.4, -0.4, 40])} />
    <g className="pg-trellis-lattice">
      {[-0.22, 0.22].map(offset => <g key={offset}>
        <polyline points={points([-0.4, offset, 40], [0.4, offset, 40])} />
        <polyline points={points([offset, -0.4, 41], [offset, 0.4, 41])} />
      </g>)}
    </g>
    <polyline className="pg-trellis-beam-front" points={points([-0.4, 0.4, 40], [0.4, 0.4, 40], [0.4, -0.4, 40])} />
    {planted && <g className="pg-trellis-roof-foliage">
      <polyline className="pg-trellis-vine-stem" points={points([-0.35, 0.32, 41], [-0.37, -0.1, 41], [-0.32, -0.36, 41], [0.1, -0.36, 41], [0.35, -0.32, 41])} />
      {([[-0.35, 0.18], [-0.35, -0.16], [-0.16, -0.35], [0.2, -0.35]] as const).map(([x, y], i) => {
        const p = iso(x, y, 41);
        return <Leaf key={`${x},${y}`} x={p.x} y={p.y} angle={i % 2 ? 65 : -62} light={i % 2 === 0} />;
      })}
    </g>}
  </g>;
}

export function TrellisGlyph({ planted = false, layer = "all" }: { planted?: boolean; layer?: Layer }): JSX.Element {
  return <g className="pg-living-glyph pg-trellis" data-living-kind="trellis" data-trellis-layer={layer} data-planted={planted ? "true" : "false"} pointerEvents="none" aria-hidden="true">
    {layer !== "front" && <g data-trellis-part="back">
      {corners.slice(0, 3).map(corner => <TrellisPost key={corner.name} corner={corner} planted={planted} />)}
    </g>}
    {layer !== "back" && <g data-trellis-part="front">
      <TrellisPost corner={corners[3]} planted={planted} />
      <TrellisRoof planted={planted} />
    </g>}
  </g>;
}

export function LivingAttachment({ kind, x, y, planted = false, ghost = false, layer = "all" }: { kind: LivingKind; x: number; y: number; planted?: boolean; ghost?: boolean; layer?: Layer }): JSX.Element {
  const c = iso(x + 0.5, y + 0.5);
  return <g className={`pg-living-attachment${ghost ? " is-ghost" : ""}`} transform={`translate(${c.x} ${c.y})`} data-piece-cell={ghost ? undefined : `${x},${y}`} data-attachment-kind={kind} data-attachment-cell={`${x},${y}`} pointerEvents="none" aria-hidden="true">
    {kind === "lamp" ? <LampGlyph /> : <TrellisGlyph planted={planted} layer={layer} />}
  </g>;
}

export function LivingIcon({ kind }: { kind: LivingKind }): JSX.Element {
  return <svg viewBox="-32 -66 64 80" className="pg-piece-icon pg-living-piece-icon" aria-hidden="true" focusable="false" pointerEvents="none">
    {kind === "trellis" ? <g className="pg-living-path-hint">
      <ellipse cx="-8" cy="-2" rx="7" ry="3.5" />
      <ellipse cx="7" cy="3" rx="7" ry="3.5" />
      <ellipse cx="2" cy="-6" rx="5" ry="2.5" />
    </g> : <g className="pg-living-table-hint">
      <polyline className="pg-living-table-legs" points={points([-0.32, 0.32, 0], [-0.32, 0.32, 14])} />
      <polyline className="pg-living-table-legs" points={points([0.32, 0.32, 0], [0.32, 0.32, 14])} />
      <polygon className="pg-living-table-edge" points={points([-0.4, 0.4, 16], [0.4, 0.4, 16], [0.4, -0.4, 16], [0.4, -0.4, 14], [0.4, 0.4, 14], [-0.4, 0.4, 14])} />
      <polygon className="pg-living-table-top" points={points([-0.4, -0.4, 16], [0.4, -0.4, 16], [0.4, 0.4, 16], [-0.4, 0.4, 16])} />
    </g>}
    <LivingAttachment kind={kind} x={-0.5} y={-0.5} planted={kind === "trellis"} />
  </svg>;
}

export const LivingPieceIcon = LivingIcon;
