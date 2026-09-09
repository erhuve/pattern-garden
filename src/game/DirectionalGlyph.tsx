import { memo } from "react";
import type { Side } from "./types";

export type DirectionalKind = "seat" | "shelf" | "gate" | "bench";
type Box = { x: number; y: number; w: number; d: number; z: number; h: number; material: string };

export function rotateXY(x: number, y: number, facing: Side) {
  switch (facing) {
    case "n": return { x: -x, y: -y };
    case "e": return { x: y, y: -x };
    case "w": return { x: -y, y: x };
    default: return { x, y };
  }
}

function model(kind: DirectionalKind, facing: Side): Box[] {
  if (kind === "seat") return [
    { x: -0.31, y: -0.25, w: 0.62, d: 0.56, z: 0, h: 9, material: "pg-seat-side" },
    { x: -0.31, y: -0.25, w: 0.62, d: 0.56, z: 9, h: 2, material: "pg-seat" },
    { x: -0.32, y: -0.35, w: 0.64, d: 0.1, z: 0, h: 24, material: "pg-seat-back" },
  ];
  if (kind === "bench") return [
    { x: -0.39, y: -0.25, w: 0.08, d: 0.08, z: 0, h: 21, material: "pg-wood" },
    { x: 0.31, y: -0.25, w: 0.08, d: 0.08, z: 0, h: 21, material: "pg-wood" },
    { x: -0.39, y: 0.15, w: 0.08, d: 0.08, z: 0, h: 9, material: "pg-wood-dark" },
    { x: 0.31, y: 0.15, w: 0.08, d: 0.08, z: 0, h: 9, material: "pg-wood-dark" },
    { x: -0.43, y: -0.16, w: 0.86, d: 0.12, z: 9, h: 2, material: "pg-wood-light" },
    { x: -0.43, y: -0.02, w: 0.86, d: 0.12, z: 9, h: 2, material: "pg-wood-light" },
    { x: -0.43, y: 0.13, w: 0.86, d: 0.12, z: 9, h: 2, material: "pg-wood-light" },
    { x: -0.31, y: -0.25, w: 0.62, d: 0.08, z: 13, h: 3, material: "pg-wood-light" },
    { x: -0.31, y: -0.25, w: 0.62, d: 0.08, z: 18, h: 3, material: "pg-wood-light" },
  ];
  if (kind === "gate") return [
    { x: -0.43, y: -0.07, w: 0.1, d: 0.14, z: 0, h: 29, material: "pg-wood" },
    { x: 0.33, y: -0.07, w: 0.1, d: 0.14, z: 0, h: 29, material: "pg-wood" },
    { x: -0.48, y: -0.09, w: 0.96, d: 0.18, z: 29, h: 3, material: "pg-wood-light" },
  ];
  const left: Box = { x: -0.42, y: -0.3, w: 0.09, d: 0.53, z: 0, h: 30, material: "pg-wood" };
  const right: Box = { ...left, x: 0.33 };
  const back: Box = { x: -0.33, y: -0.3, w: 0.66, d: 0.08, z: 0, h: 30, material: "pg-wood" };
  const contents: Box[] = [];
  for (let row = 0; row < 3; row++) {
    contents.push({ x: -0.33, y: -0.22, w: 0.66, d: 0.45, z: row * 10, h: 1, material: "pg-wood-light" });
    const books: Box[] = [];
    for (let col = 0; col < 4; col++) books.push({ x: -0.28 + col * 0.14, y: -0.15, w: 0.1, d: 0.29, z: 1 + row * 10, h: 6 + col % 2, material: `pg-book-${col % 3}` });
    if (facing === "n" || facing === "e") books.reverse();
    contents.push(...books);
  }
  contents.push({ x: -0.33, y: -0.22, w: 0.66, d: 0.45, z: 29, h: 1, material: "pg-wood-light" });
  const frontVisible = facing === "s" || facing === "e";
  const nearSide = facing === "s" || facing === "w" ? right : left;
  const farSide = nearSide === right ? left : right;
  return frontVisible ? [farSide, back, ...contents, nearSide] : [farSide, ...contents, back, nearSide];
}

export function orderedModel(kind: DirectionalKind, facing: Side): Box[] {
  const boxes = model(kind, facing);
  if (kind === "bench") {
    const order: Record<Side, number[]> = {
      s: [0, 7, 8, 1, 2, 3, 4, 5, 6],
      e: [1, 7, 8, 0, 3, 2, 4, 5, 6],
      n: [3, 2, 6, 5, 4, 1, 7, 8, 0],
      w: [2, 3, 6, 5, 4, 0, 7, 8, 1],
    };
    return order[facing].map(index => boxes[index]);
  }
  if (kind === "seat") return facing === "s" || facing === "e" ? [boxes[2], boxes[0], boxes[1]] : boxes;
  if (kind === "gate" && (facing === "n" || facing === "e")) return [boxes[1], boxes[0], boxes[2]];
  return boxes;
}

export const DirectionalGlyph = memo(function DirectionalGlyph({ kind, facing }: { kind: DirectionalKind; facing: Side }) {
  const project = (x: number, y: number, z: number) => {
    const p = rotateXY(x, y, facing);
    return `${((p.x - p.y) * 30).toFixed(2)},${((p.x + p.y) * 15 - z).toFixed(2)}`;
  };
  return <>
    {orderedModel(kind, facing).map((b, index) => {
      const x = b.x, y = b.y, X = x + b.w, Y = y + b.d, z = b.z, Z = z + b.h;
      const sides = [
        { normal: [0, -1], points: [[x, y, z], [X, y, z], [X, y, Z], [x, y, Z]] },
        { normal: [1, 0], points: [[X, y, z], [X, Y, z], [X, Y, Z], [X, y, Z]] },
        { normal: [0, 1], points: [[X, Y, z], [x, Y, z], [x, Y, Z], [X, Y, Z]] },
        { normal: [-1, 0], points: [[x, Y, z], [x, y, z], [x, y, Z], [x, Y, Z]] },
      ];
      return <g key={index}>
        {sides.flatMap((face, side) => {
          const normal = rotateXY(face.normal[0], face.normal[1], facing);
          if (normal.x + normal.y <= 0) return [];
          return [<polygon key={side} points={face.points.map(([px, py, pz]) => project(px, py, pz)).join(" ")} className={b.material} style={{ filter: normal.x > 0 ? "brightness(.82)" : "brightness(.94)" }} />];
        })}
        <polygon points={[[x, y], [X, y], [X, Y], [x, Y]].map(([px, py]) => project(px, py, Z)).join(" ")} className={b.material} />
      </g>;
    })}
  </>;
});
