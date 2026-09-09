import { describe, expect, test } from "bun:test";
import { evaluate, LEVELS } from "./levels";
import { EXPANDED_SOLUTIONS } from "./expanded-solutions";
import type { Layout } from "./types";

const front = LEVELS.find((level) => level.slug === "front-door-bench")!;
const base = (): Layout => ({ ...front, pieces: structuredClone(EXPANDED_SOLUTIONS[front.slug]) });
const pathCheck = (layout: Layout) => evaluate(front, layout).checks.find((item) => item.id === "path")!;

describe("bench path meets the existing road", () => {
  test("the garden path completes at the road boundary without spending a stone on the road", () => {
    const layout = base();
    expect(layout.pieces.filter((piece) => piece.kind === "path")).toHaveLength(4);
    expect(layout.pieces.some((piece) => "y" in piece && piece.y === layout.world.h - 1)).toBe(false);
    expect(pathCheck(layout).ratio).toBe(1);
    expect(evaluate(front, layout).score).toBe(100);
    expect(pathCheck(layout).detail).toContain("road needs no stones");
  });

  test("legacy road stones are optional, preserved and safe to remove", () => {
    const layout = base();
    layout.pieces.push({ kind: "path", x: 4, y: 8 }, { kind: "path", x: 3, y: 5 }, { kind: "plant", x: 5, y: 4 });
    const saved = JSON.stringify(layout);
    const legacy = evaluate(front, layout);
    expect(legacy.score).toBe(100);
    expect(JSON.stringify(layout)).toBe(saved);
    const withoutRoad = { ...layout, pieces: layout.pieces.filter((piece) => !("y" in piece && piece.y === 8)) };
    expect(evaluate(front, withoutRoad)).toEqual(legacy);
    expect(evaluate(front, JSON.parse(JSON.stringify(withoutRoad)))).toEqual(legacy);
    expect(evaluate(front, { ...withoutRoad, pieces: [...withoutRoad.pieces].reverse() })).toEqual(legacy);
  });

  test("neither the road nor an old road stone fills a missing garden tile", () => {
    for (const roadStone of [false, true]) {
      for (const y of [4, 5, 6, 7]) {
        const layout = base();
        layout.pieces = layout.pieces.filter((piece) => !("x" in piece && piece.x === 4 && piece.y === y));
        if (roadStone) layout.pieces.push({ kind: "path", x: 4, y: 8 });
        expect(pathCheck(layout).ratio).toBe(0);
        expect(evaluate(front, layout).score).toBeLessThan(100);
      }
    }
  });

  test("diagonal-only garden connections fail but a cardinal bend reaches the road", () => {
    const layout = base();
    layout.pieces = layout.pieces.filter((piece) => !("x" in piece && piece.x === 4 && piece.y === 7));
    layout.pieces.push({ kind: "path", x: 5, y: 7 });
    expect(pathCheck(layout).ratio).toBe(0);
    layout.pieces.push({ kind: "path", x: 5, y: 6 });
    expect(evaluate(front, layout).score).toBe(100);
  });

  test("a blocked street entry cannot borrow a diagonal neighboring road tile", () => {
    for (const kind of ["plant", "hedge", "tree"] as const) {
      const layout = base();
      layout.pieces.push({ kind, x: 4, y: 8 });
      expect(pathCheck(layout).ratio).toBe(0);
      layout.pieces.push({ kind: "path", x: 5, y: 7 });
      expect(pathCheck(layout).ratio).toBe(1);
    }
  });

  test("an unpaved lawn route to the road still needs continuous stones", () => {
    const layout = base();
    layout.pieces = layout.pieces.filter((piece) => piece.kind !== "path");
    expect(pathCheck(layout).ratio).toBe(0);
    expect(pathCheck(layout).detail).toContain("No stone is needed on the road itself");
  });
});
