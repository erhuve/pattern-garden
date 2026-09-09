import { describe, expect, test } from "bun:test";
import { evaluate, LEVELS } from "./levels";
import { EXPANDED_SOLUTIONS } from "./expanded-solutions";
import { automaticFacing, FACINGS, resolveFacing } from "./orientation";
import { step } from "./place-rules";
import type { CellPiece, Layout, Piece } from "./types";

const front = LEVELS.find((level) => level.slug === "front-door-bench")!;
const bench = EXPANDED_SOLUTIONS[front.slug].find((piece) => piece.kind === "bench") as CellPiece;
const base = (): Layout => ({ ...front, pieces: structuredClone(EXPANDED_SOLUTIONS[front.slug]) });

function check(layout: Layout, id: string) {
  return evaluate(front, layout).checks.find((item) => item.id === id)!;
}

describe("bench facing and street score regression", () => {
  test("paving in front never turns an auto bench away from the street", () => {
    const layout = base();
    const before = evaluate(front, layout);
    layout.pieces.push({ kind: "path", x: 3, y: 5 });
    const frozen = JSON.stringify(layout);
    expect(automaticFacing(front.slug, layout, bench).direction).toBe("s");
    expect(evaluate(front, layout)).toEqual(before);
    expect(automaticFacing(front.slug, { ...layout, pieces: [...layout.pieces].reverse() }, bench).direction).toBe("s");
    expect(JSON.stringify(layout)).toBe(frozen);
    layout.pieces.pop();
    expect(resolveFacing(front.slug, layout, bench).direction).toBe("s");
  });

  test("flat paths are passable for benches and chairs in all four directions", () => {
    for (const side of FACINGS) {
      const point = { x: 4, y: 4 };
      const path: Piece = { kind: "path", ...step(point, side) };
      const layout: Layout = { world: { w: 9, h: 9 }, room: { x: 0, y: 0, w: 9, h: 9 }, setting: "garden", outdoorFurniture: true, street: side, pieces: [] };
      const b: CellPiece = { kind: "bench", ...point };
      layout.pieces = [b, path];
      expect(resolveFacing(front.slug, layout, b).direction).toBe(side);
      const chair: CellPiece = { kind: "seat", ...point };
      layout.pieces = [chair, path, { kind: "table", ...step(point, side, 2) }];
      expect(resolveFacing("outdoor-room", layout, chair).direction).toBe(side);
      layout.pieces[1] = { kind: "hedge", ...step(point, side) };
      expect(resolveFacing("outdoor-room", layout, chair).direction).not.toBe(side);
    }
  });

  test("shelves treat paving as clear frontage without accepting a hedge in its place", () => {
    const shelf: CellPiece = { kind: "shelf", x: 4, y: 2 };
    const layout: Layout = { world: { w: 9, h: 9 }, room: { x: 2, y: 2, w: 5, h: 5 }, pieces: [shelf, { kind: "path", x: 4, y: 3 }] };
    expect(resolveFacing("alcoves", layout, shelf).direction).toBe("s");
    layout.pieces[1] = { kind: "hedge", x: 4, y: 3 };
    expect(resolveFacing("alcoves", layout, shelf).direction).not.toBe("s");
  });

  test("saved manual facing and rendered auto facing use exactly the same scoring rule", () => {
    for (const facing of FACINGS) {
      const layout = base();
      layout.pieces = layout.pieces.map((piece) => piece.kind === "bench" ? { ...piece, facing } : piece);
      layout.pieces.push({ kind: "path", x: 3, y: 5 });
      const saved = JSON.parse(JSON.stringify(layout)) as Layout;
      const b = saved.pieces.find((piece) => piece.kind === "bench") as CellPiece;
      expect(resolveFacing(front.slug, saved, b).direction).toBe(facing);
      expect(check(saved, "view").ratio).toBe(Number(facing === "s"));
      expect(evaluate(front, saved).score).toBe(facing === "s" ? 100 : 80);
      delete b.facing;
      expect(evaluate(front, saved).score).toBe(100);
    }
  });

  test("fixed street-facing direction cannot bypass a blocked view or approach", () => {
    for (const kind of ["tree", "hedge", "shelf"] as const) {
      const layout = base();
      layout.pieces = layout.pieces.map((piece) => piece.kind === "bench" ? { ...piece, facing: "s" } : piece);
      layout.pieces.push({ kind, x: 3, y: 6 });
      expect(check(layout, "view").ratio).toBe(0);
      expect(evaluate(front, layout).score).toBeLessThan(100);
    }
    const layout = base();
    layout.pieces.push({ kind: "plant", x: 3, y: 5 });
    expect(check(layout, "path").ratio).toBe(0);
    expect(evaluate(front, layout).score).toBeLessThan(100);
  });
});

describe("Outdoor Room screenshot explanation", () => {
  test("oversized 6×6 U is 77%, moving two sides inward preserves furniture and reaches 100%", () => {
    const level = LEVELS.find((item) => item.slug === "outdoor-room")!;
    const furniture: Piece[] = [{ kind: "table", x: 4, y: 4 }, { kind: "seat", x: 3, y: 4 }, { kind: "seat", x: 4, y: 3 }];
    const oversized: Piece[] = [
      ...furniture,
      ...[1, 2, 3, 4, 5, 6].map((x): Piece => ({ kind: "hedge", x, y: 1 })),
      ...[2, 3, 4, 5, 6].flatMap((y): Piece[] => [{ kind: "hedge", x: 1, y }, { kind: "hedge", x: 6, y }]),
    ];
    const result = evaluate(level, { ...level, pieces: oversized });
    expect(result.score).toBe(77);
    expect(result.checks.filter((item) => item.ratio < 1).map((item) => item.id)).toEqual(["walls"]);
    expect(result.checks.find((item) => item.id === "walls")?.detail).toContain("1 of 3");
    const corrected = [...furniture, ...EXPANDED_SOLUTIONS[level.slug].filter((piece) => piece.kind === "hedge")];
    expect(corrected.filter((piece) => piece.kind === "hedge")).toHaveLength(13);
    expect(evaluate(level, { ...level, pieces: corrected }).score).toBe(100);
  });
});
