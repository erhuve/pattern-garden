import { describe, expect, test } from "bun:test";
import { LEVELS, evaluate } from "./levels";
import { cellPieces, placeAt, removeAt, usedInventory } from "./geometry";
import { windowNook } from "./window-place";
import type { Layout, Piece, Side } from "./types";

const level = LEVELS.find((l) => l.slug === "window-place")!;
const layout = (pieces: Piece[]): Layout => ({ room: level.room, world: level.world, pieces });
const base: Piece[] = [{ kind: "window", side: "n", pos: 1 }, { kind: "seat", x: 3, y: 2 }, { kind: "shelf", x: 2, y: 2 }];

describe("Window Place", () => {
  test("one window and a side shelf make a nook without plants or extra glazing", () => {
    expect(windowNook(layout(base), { x: 3, y: 2 })).toEqual({ enclosed: true, accessible: true });
    expect(evaluate(level, layout(base)).score).toBe(100);
    expect(evaluate(level, layout([...base].reverse()))).toEqual(evaluate(level, layout(base)));
  });

  for (const [name, other] of [
    ["diagonal shelf", { kind: "shelf", x: 2, y: 3 }],
    ["shelf behind the chair", { kind: "shelf", x: 3, y: 3 }],
    ["low side table", { kind: "table", x: 2, y: 2 }],
  ] as const) test(`rejects ${name} as side enclosure`, () => {
    const pieces: Piece[] = [...base.slice(0, 2), other];
    expect(windowNook(layout(pieces), { x: 3, y: 2 }).enclosed).toBe(false);
    expect(evaluate(level, layout(pieces)).score).toBeLessThan(100);
  });

  test("boxed seats fail access even with side enclosure", () => {
    const pieces: Piece[] = [...base, { kind: "shelf", x: 4, y: 2 }, { kind: "table", x: 3, y: 3 }];
    expect(windowNook(layout(pieces), { x: 3, y: 2 })).toEqual({ enclosed: true, accessible: false });
    expect(evaluate(level, layout(pieces)).score).toBeLessThan(100);
  });

  test("an empty adjacent tile alone cannot satisfy access if its route is blocked", () => {
    const pieces: Piece[] = [{ kind: "window", side: "n", pos: 0 }, { kind: "seat", x: 2, y: 2 }, { kind: "shelf", x: 3, y: 2 }, { kind: "shelf", x: 3, y: 3 }, { kind: "table", x: 2, y: 4 }];
    expect(windowNook(layout(pieces), { x: 2, y: 2 }).accessible).toBe(false);
  });

  for (const [side, pos, x, y] of [["n", 0, 2, 2], ["w", 0, 2, 2], ["s", 3, 5, 4], ["e", 2, 5, 4]] as const) {
    test(`recognizes solid corner enclosure on ${side}`, () => {
      expect(evaluate(level, layout([{ kind: "window", side, pos }, { kind: "seat", x, y }])).score).toBe(100);
    });
  }

  test("corner openings do not pretend to be solid side walls", () => {
    const pieces: Piece[] = [{ kind: "window", side: "n", pos: 0 }, { kind: "window", side: "w", pos: 0 }, { kind: "seat", x: 2, y: 2 }];
    expect(windowNook(layout(pieces), { x: 2, y: 2 }).enclosed).toBe(false);
  });

  test("every window seat must be enclosed and reachable, not just one", () => {
    const pieces: Piece[] = [...base, { kind: "window", side: "n", pos: 2 }, { kind: "seat", x: 4, y: 2 }];
    expect(evaluate(level, layout(pieces)).checks.find((c) => c.id === "enclosure")?.ratio).toBe(0.5);
    expect(evaluate(level, layout(pieces)).score).toBeLessThan(100);
  });
});

describe("Window sill plants", () => {
  for (const side of ["n", "e", "s", "w"] as Side[]) test(`attaches to ${side} without taking a floor cell`, () => {
    const pieces: Piece[] = [{ kind: "window", side, pos: 0 }, { kind: "seat", x: 2, y: 2, facing: "e" }];
    const snapshot = JSON.stringify(pieces);
    const result = placeAt(level, pieces, "plant", { type: "wall", side, pos: 0 });
    expect(typeof result).not.toBe("string");
    const planted = result as Piece[];
    expect(planted[0]).toEqual({ kind: "window", side, pos: 0, sillPlant: true });
    expect(cellPieces(layout(planted))).toEqual(cellPieces(layout(pieces)));
    expect(usedInventory(planted, "plant")).toBe(1);
    expect(usedInventory(planted, "window")).toBe(1);
    expect(JSON.stringify(pieces)).toBe(snapshot);
    expect(JSON.parse(JSON.stringify(planted))).toEqual(planted);
    expect(typeof placeAt(level, planted, "plant", { type: "wall", side, pos: 0 })).toBe("string");
    expect(removeAt(level, planted, { type: "sill", side, pos: 0 })).toEqual(pieces);
    expect(removeAt(level, planted, { type: "wall", side, pos: 0 })).toEqual([pieces[1]]);
  });

  test("floor and sill plants share one inventory limit", () => {
    const pieces: Piece[] = [{ kind: "window", side: "n", pos: 0 }, { kind: "window", side: "n", pos: 1, sillPlant: true }, { kind: "plant", x: 4, y: 3 }];
    expect(usedInventory(pieces, "plant")).toBe(2);
    expect(typeof placeAt(level, pieces, "plant", { type: "wall", side: "n", pos: 0 })).toBe("string");
    expect(typeof placeAt(level, pieces, "plant", { type: "cell", x: 5, y: 3 })).toBe("string");
  });

  test("rejects blank walls, doors and alcoves; floor placement still works", () => {
    for (const pieces of [[], [{ kind: "door", side: "n", pos: 0 }], [{ kind: "alcove", side: "n", pos: 0 }]] as Piece[][]) {
      expect(typeof placeAt(level, pieces, "plant", { type: "wall", side: "n", pos: 0 })).toBe("string");
    }
    expect(placeAt(level, [], "plant", { type: "cell", x: 3, y: 3 })).toEqual([{ kind: "plant", x: 3, y: 3 }]);
  });

  test("plants are optional and don't change the score or seat orientation metadata", () => {
    const planted = placeAt(level, base, "plant", { type: "wall", side: "n", pos: 1 }) as Piece[];
    expect(evaluate(level, layout(planted))).toEqual(evaluate(level, layout(base)));
  });
});

describe("Larger Sitting Circle", () => {
  test("has 7 by 6 room space, retains six-seat completion and old coordinates", () => {
    const circle = LEVELS.find((l) => l.slug === "sitting-circle")!;
    expect(circle.room).toEqual({ x: 2, y: 2, w: 7, h: 6 });
    const pieces: Piece[] = [{ kind: "door", side: "s", pos: 0 }, { kind: "hearth", x: 5, y: 3 }];
    for (const [x, y] of [[4, 2], [5, 2], [6, 2], [4, 3], [6, 3], [5, 4]]) pieces.push({ kind: "seat", x, y });
    expect(evaluate(circle, { room: circle.room, world: circle.world, pieces }).score).toBe(100);
    expect(typeof placeAt(circle, pieces, "shelf", { type: "cell", x: 8, y: 7 })).not.toBe("string");
    expect(LEVELS.find((l) => l.slug === "alcoves")!.room).toEqual({ x: 2, y: 2, w: 5, h: 4 });
  });
});
