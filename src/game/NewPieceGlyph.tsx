import type { Side } from "./types";
import "./new-pieces.css";

type Point = [number, number, number];
const iso = (x: number, y: number, z = 0) => ({ x: (x - y) * 30, y: (x + y) * 15 - z });
const points = (...vertices: Point[]) => vertices.map(([x, y, z]) => {
  const p = iso(x, y, z);
  return `${p.x},${p.y}`;
}).join(" ");

export function NewPieceGlyph({ kind, x, y }: { kind: "desk" | "hedge"; x: number; y: number; facing?: Side; manual?: boolean }) {
  const c = iso(x + 0.5, y + 0.5);
  return <g className="pg-piece" data-piece-cell={`${x},${y}`} data-kind={kind} transform={`translate(${c.x} ${c.y})`}>
    {kind === "desk" ? <>
      {([[-0.34, -0.34], [-0.34, 0.26], [0.26, -0.34], [0.26, 0.26]] as const).map(([a, b]) => <g key={`${a},${b}`}>
        <polygon className="pg-desk-leg" points={points([a, b + 0.08, 0], [a + 0.08, b + 0.08, 0], [a + 0.08, b + 0.08, 15], [a, b + 0.08, 15])} />
        <polygon className="pg-desk-leg-side" points={points([a + 0.08, b, 0], [a + 0.08, b + 0.08, 0], [a + 0.08, b + 0.08, 15], [a + 0.08, b, 15])} />
      </g>)}
      <polygon className="pg-desk-edge" points={points([-0.4, 0.4, 15], [0.4, 0.4, 15], [0.4, 0.4, 18], [-0.4, 0.4, 18])} />
      <polygon className="pg-desk-edge" style={{ filter: "brightness(.82)" }} points={points([0.4, -0.4, 15], [0.4, 0.4, 15], [0.4, 0.4, 18], [0.4, -0.4, 18])} />
      <polygon className="pg-desk-top" points={points([-0.4, -0.4, 18], [0.4, -0.4, 18], [0.4, 0.4, 18], [-0.4, 0.4, 18])} />
      <g className="pg-new-piece-detail">
        <polygon className="pg-desk-notebook" points={points([-0.22, -0.17, 18.4], [0.22, -0.17, 18.4], [0.22, 0.18, 18.4], [-0.22, 0.18, 18.4])} />
        <polyline className="pg-desk-fold" points={points([0, -0.17, 18.5], [0, 0.18, 18.5])} />
        {[-0.06, 0.03, 0.12].map(row => <g key={row}>
          <polyline className="pg-desk-writing" points={points([-0.17, row, 18.5], [-0.06, row, 18.5])} />
          <polyline className="pg-desk-writing" points={points([0.05, row, 18.5], [0.16, row, 18.5])} />
        </g>)}
        <polyline className="pg-desk-pencil" points={points([-0.17, -0.28, 18.5], [0.16, -0.28, 18.5])} />
      </g>
    </> : <>
      <path className="pg-hedge-twig pg-new-piece-detail" d="M-6 1v-7m0 3-3-3M6 1v-7m0 3 3-3" />
      <polygon className="pg-hedge-front" points={points([-0.4, 0.4, 3], [-0.2, 0.4, 2], [0, 0.4, 3], [0.2, 0.4, 2], [0.4, 0.4, 3], [0.4, 0.4, 20], [-0.4, 0.4, 20])} />
      <polygon className="pg-hedge-side" points={points([0.4, -0.4, 3], [0.4, -0.2, 2], [0.4, 0, 3], [0.4, 0.2, 2], [0.4, 0.4, 3], [0.4, 0.4, 20], [0.4, -0.4, 20])} />
      <polygon className="pg-hedge-top" points={points([-0.4, -0.4, 20], [0.4, -0.4, 20], [0.4, 0.4, 20], [-0.4, 0.4, 20])} />
      <g className="pg-new-piece-detail">
        {([[-0.3, 14], [-0.07, 10], [0.17, 15], [-0.26, 7], [0.14, 6]] as const).map(([a, z]) => <g key={`${a},${z}`}>
          <polyline className="pg-hedge-leaf" points={points([a, 0.4, z], [a + 0.05, 0.4, z - 1.2], [a + 0.12, 0.4, z - 0.5])} />
          <polyline className="pg-hedge-leaf" points={points([0.4, a, z], [0.4, a + 0.05, z - 1.2], [0.4, a + 0.12, z - 0.5])} />
        </g>)}
        <path className="pg-hedge-crown" d="m-12-21 2 1 2-1m3-7 2 1 2-1m3 7 2 1 2-1m-10 7 2 1 2-1" />
      </g>
    </>}
  </g>;
}
