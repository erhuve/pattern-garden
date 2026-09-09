import { describe, expect, test } from "bun:test";
import { LIVING_LEVELS } from "./living-levels";
import { LIVING_BUILD_SEQUENCES, LIVING_SOLUTIONS } from "./living-solutions";
import { evaluate } from "./levels";
import { inWorld, placeAt, removeAt, sameCell, usedInventory } from "./geometry";
import { FACINGS, resolveFacing, setFacing } from "./orientation";
import { cellKey, freeFloor, reachable } from "./place-rules";
import { gardenSunny, sceneEndpoints, sceneReserved } from "./scene-terrain";
import { isCellPiece, type Cell, type CheckResult, type Layout, type Piece } from "./types";

const levelFor = (slug: string) => LIVING_LEVELS.find((level) => level.slug === slug)!;
const solution = (slug: string): Piece[] => structuredClone(LIVING_SOLUTIONS[slug]);
const layoutFor = (slug: string, pieces = solution(slug)): Layout => ({ ...levelFor(slug), pieces });
const result = (slug: string, pieces = solution(slug)) => evaluate(levelFor(slug), layoutFor(slug, pieces));
const check = (slug: string, id: string, pieces = solution(slug)): CheckResult => result(slug, pieces).checks.find((item) => item.id === id)!;
const without = (pieces: Piece[], cell: Cell): Piece[] => pieces.filter((piece) => !isCellPiece(piece) || !sameCell(piece, cell));
const editCell = (pieces: Piece[], cell: Cell, change: (piece: Piece) => Piece): Piece[] => pieces.map((piece) => isCellPiece(piece) && sameCell(piece, cell) ? change(piece) : piece);
const badAt = (value: CheckResult, cell: Cell) => value.marks?.some((mark) => mark.tone === "bad" && sameCell(mark.cell, cell));

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function build(slug: string): Piece[] {
  const level = levelFor(slug);
  let placed = structuredClone(level.starting);
  for (const action of LIVING_BUILD_SEQUENCES[slug]) {
    const next = placeAt(level, placed, action.kind, action.target);
    expect(typeof next, `${slug}: ${JSON.stringify(action)}: ${next}`).not.toBe("string");
    if (typeof next === "string") throw new Error(next);
    placed = next;
  }
  return placed;
}

const windowSlug = "windows-overlooking-life";
const mealSlug = "eating-atmosphere";
const gardenSlug = "garden-seat";
const walkSlug = "trellised-walk";

describe("living level contracts", () => {
  test("four distinct patterns have bounded palettes and explicit adaptations", () => {
    expect(LIVING_LEVELS.map((level) => level.number)).toEqual([192, 182, 176, 174]);
    expect(new Set(LIVING_LEVELS.map((level) => level.slug)).size).toBe(4);
    for (const level of LIVING_LEVELS) {
      expect(level.adaptation!.length).toBeGreaterThan(100);
      expect(level.palette.length).toBeLessThanOrEqual(6);
      expect(level.palette.every((entry) => Number.isInteger(entry.max) && entry.max > 0)).toBe(true);
      for (const entry of level.palette) expect(usedInventory(solution(level.slug), entry.kind)).toBeLessThanOrEqual(entry.max);
    }
  });

  for (const level of LIVING_LEVELS) {
    test(`${level.slug}: known fixture builds using legal host-before-attachment actions`, () => {
      const placed = build(level.slug);
      expect(placed).toEqual(solution(level.slug));
      expect(result(level.slug, placed).score).toBe(100);
      expect(result(level.slug).checks.every((item) => item.ratio === 1)).toBe(true);
      expect(result(level.slug).attractors.length).toBeGreaterThan(0);
      for (const piece of placed.filter(isCellPiece)) expect(sceneReserved(level, piece)).toBe(false);
    });

    test(`${level.slug}: empty and reset starts are incomplete with informative checks`, () => {
      for (const pieces of [[], level.starting]) {
        const value = result(level.slug, pieces);
        expect(value.score).toBeLessThan(100);
        expect(value.attractors).toEqual([]);
        expect(value.checks.length).toBeLessThanOrEqual(6);
        expect(value.checks.reduce((sum, item) => sum + item.points, 0)).toBe(100);
        expect(new Set(value.checks.map((item) => item.id)).size).toBe(value.checks.length);
        expect(value.checks.every((item) => item.detail.length > 25)).toBe(true);
      }
    });

    test(`${level.slug}: deeply frozen layouts are deterministic and insertion-order independent`, () => {
      const layout = freeze(layoutFor(level.slug));
      const before = JSON.stringify(layout);
      const first = level.evaluate(layout);
      expect(level.evaluate(layout)).toEqual(first);
      expect(JSON.stringify(layout)).toBe(before);
      expect(level.evaluate({ ...layout, pieces: [...layout.pieces].reverse() })).toEqual(first);
      expect(level.evaluate({ ...layout, pieces: [...layout.pieces.slice(2), ...layout.pieces.slice(0, 2)] })).toEqual(first);
      expect(level.evaluate(JSON.parse(before))).toEqual(first);
    });

    test(`${level.slug}: incomplete diagnostic results are also immutable and order independent`, () => {
      const pieces = solution(level.slug);
      for (let removed = 0; removed < pieces.length; removed++) {
        const layout = freeze(layoutFor(level.slug, pieces.filter((_, index) => index !== removed)));
        const before = JSON.stringify(layout);
        expect(level.evaluate({ ...layout, pieces: [...layout.pieces].reverse() })).toEqual(level.evaluate(layout));
        expect(JSON.stringify(layout)).toBe(before);
      }
    });

    test(`${level.slug}: every diagnostic mark names a real cell and does not leak mutable pieces`, () => {
      const layout = layoutFor(level.slug);
      for (const item of level.evaluate(layout).checks) {
        for (const mark of item.marks ?? []) {
          expect(inWorld(layout.world, mark.cell)).toBe(true);
          expect(Object.keys(mark.cell).sort()).toEqual(["x", "y"]);
          expect(["good", "bad", "hint"]).toContain(mark.tone);
          expect(layout.pieces.some((piece) => piece === mark.cell)).toBe(false);
        }
      }
    });

    test(`${level.slug}: removing each structural solution piece prevents completion`, () => {
      const pieces = solution(level.slug);
      for (let i = 0; i < pieces.length; i++) {
        const piece = pieces[i];
        if (level.slug === gardenSlug && piece.kind === "hedge" && (piece.x === 2 || piece.x === 6) && piece.y === 5) continue;
        expect(result(level.slug, pieces.filter((_, index) => index !== i)).score, JSON.stringify(piece)).toBeLessThan(100);
      }
    });
  }

  test("full earned rounding never turns a fractional check into 100", () => {
    const level = { ...levelFor(walkSlug), evaluate: () => ({ checks: [{ id: "fraction", label: "Nearly", detail: "One requirement is not quite full.", points: 100, earned: 100, ratio: 0.999 }], attractors: [] }) };
    expect(evaluate(level, layoutFor(walkSlug)).score).toBe(99);
  });
});

describe("windows overlooking life", () => {
  test("Auto faces both windows south and each manual facing is scored as drawn", () => {
    for (const seat of solution(windowSlug).filter(isCellPiece)) {
      expect(resolveFacing(windowSlug, layoutFor(windowSlug), seat).direction).toBe("s");
      for (const facing of FACINGS) {
        const pieces = setFacing(solution(windowSlug), seat, facing);
        expect(check(windowSlug, "views", pieces).ratio).toBe(facing === "s" ? 1 : 0.5);
      }
    }
  });

  test("side windows, insufficient windows and duplicate walls cannot substitute for two real views", () => {
    const sideWindows = solution(windowSlug).map((piece): Piece => piece.kind === "window" ? { ...piece, side: "e" } : piece);
    expect(check(windowSlug, "windows", sideWindows).ratio).toBe(0);
    const one = solution(windowSlug).filter((piece) => piece.kind !== "window" || piece.pos === 1);
    expect(check(windowSlug, "windows", one).ratio).toBe(0.5);
    expect(check(windowSlug, "views", one).ratio).toBe(0.5);
    expect(result(windowSlug, [...one, { kind: "window", side: "s", pos: 1 }]).score).toBeLessThan(100);
  });

  test("shelves block indoor views while ordinary low plants do not", () => {
    const blocked: Piece[] = [...solution(windowSlug), { kind: "shelf", x: 3, y: 4 }];
    expect(check(windowSlug, "views", blocked).ratio).toBe(0.5);
    expect(badAt(check(windowSlug, "views", blocked), { x: 3, y: 4 })).toBe(true);
    const low: Piece[] = [...solution(windowSlug), { kind: "plant", x: 3, y: 4 }];
    expect(check(windowSlug, "views", low).ratio).toBe(1);
  });

  test("outside tree or hedge blocks the promenade ray and receives a mark", () => {
    for (const kind of ["tree", "hedge"] as const) {
      const pieces: Piece[] = [...solution(windowSlug), { kind, x: 3, y: 6 }];
      expect(check(windowSlug, "windows", pieces).ratio).toBe(0.5);
      expect(check(windowSlug, "views", pieces).ratio).toBe(0.5);
      expect(badAt(check(windowSlug, "windows", pieces), { x: 3, y: 6 })).toBe(true);
    }
  });

  test("two chairs on one column cannot share one window or see through one another", () => {
    const pieces = editCell(solution(windowSlug), { x: 5, y: 3 }, (piece) => ({ ...piece, x: 3, y: 2, facing: "s" } as Piece));
    expect(check(windowSlug, "windows", pieces).ratio).toBe(1);
    expect(check(windowSlug, "views", pieces).ratio).toBe(0.5);
  });

  test("one blind chair remains incomplete even with four overlooking windows", () => {
    const pieces: Piece[] = [...editCell(solution(windowSlug), { x: 3, y: 3 }, (piece) => ({ ...piece, x: 4 } as Piece)), { kind: "window", side: "s", pos: 0 }, { kind: "window", side: "s", pos: 4 }];
    expect(check(windowSlug, "windows", pieces).ratio).toBe(1);
    expect(check(windowSlug, "views", pieces).ratio).toBe(0.5);
  });

  test("an enclosed corner seat has no access despite clear glazing", () => {
    const pieces: Piece[] = [
      { kind: "door", side: "n", pos: 2 }, { kind: "window", side: "s", pos: 0 }, { kind: "window", side: "s", pos: 3 },
      { kind: "seat", x: 2, y: 4, facing: "s" }, { kind: "seat", x: 5, y: 3, facing: "s" },
      { kind: "shelf", x: 2, y: 3 }, { kind: "shelf", x: 3, y: 4 },
    ];
    expect(check(windowSlug, "views", pieces).ratio).toBe(1);
    expect(check(windowSlug, "access", pieces).ratio).toBe(0.5);
    expect(badAt(check(windowSlug, "access", pieces), { x: 2, y: 4 })).toBe(true);
  });

  test("both door thresholds matter and no missing door is invented by BFS", () => {
    for (const y of [0, 1]) expect(check(windowSlug, "access", [...solution(windowSlug), { kind: "plant", x: 4, y }]).ratio).toBe(0);
    expect(check(windowSlug, "access", solution(windowSlug).filter((piece) => piece.kind !== "door")).ratio).toBe(0);
  });
});

describe("eating atmosphere", () => {
  test("each chair Auto faces the table and wrong manual directions fail only that chair", () => {
    for (const seat of solution(mealSlug).filter(isCellPiece).filter((piece) => piece.kind === "seat")) {
      const direction = resolveFacing(mealSlug, layoutFor(mealSlug), seat).direction;
      for (const facing of FACINGS) expect(check(mealSlug, "chairs", setFacing(solution(mealSlug), seat, facing)).ratio).toBe(facing === direction ? 1 : 0.75);
    }
  });

  test("a diagonal chair is not a table side", () => {
    const pieces = editCell(solution(mealSlug), { x: 5, y: 3 }, (piece) => ({ ...piece, y: 2 } as Piece));
    expect(check(mealSlug, "chairs", pieces).ratio).toBe(0.75);
    expect(check(mealSlug, "access", pieces).ratio).toBe(0.75);
  });

  test("each pullback tile must be free even when a side approach exists", () => {
    for (const cell of [{ x: 4, y: 1 }, { x: 6, y: 3 }, { x: 4, y: 5 }, { x: 2, y: 3 }]) {
      const pieces: Piece[] = [...solution(mealSlug), { kind: "plant", ...cell }];
      expect(check(mealSlug, "access", pieces).ratio).toBeLessThan(1);
      expect(badAt(check(mealSlug, "access", pieces), cell)).toBe(true);
      expect(check(mealSlug, "chairs", pieces).ratio).toBe(1);
    }
  });

  test("empty pullback inside a sealed pocket remains unreachable", () => {
    const pieces: Piece[] = [...solution(mealSlug), { kind: "shelf", x: 6, y: 2 }, { kind: "shelf", x: 6, y: 4 }, { kind: "plant", x: 7, y: 3 }];
    expect(freeFloor(layoutFor(mealSlug, pieces), "inside").some((cell) => sameCell(cell, { x: 6, y: 3 }))).toBe(true);
    expect(check(mealSlug, "access", pieces).ratio).toBe(0.75);
    expect(badAt(check(mealSlug, "access", pieces), { x: 6, y: 3 })).toBe(true);
  });

  test("a chair against the wall has no pullback beyond the room", () => {
    const pieces = solution(mealSlug).map((piece): Piece => isCellPiece(piece) ? { ...piece, x: piece.x - 2 } : piece);
    expect(check(mealSlug, "chairs", pieces).ratio).toBe(1);
    expect(check(mealSlug, "access", pieces).ratio).toBeLessThan(1);
  });

  test("lamp is attached to this table; unrelated attachment flags cannot light it", () => {
    const unlit = editCell(solution(mealSlug), { x: 4, y: 3 }, (piece) => {
      const { lamp: _lamp, ...table } = piece as Extract<Piece, { x: number }>;
      return table;
    });
    expect(check(mealSlug, "lamp", unlit).ratio).toBe(0);
    expect(check(mealSlug, "lamp", [...unlit, { kind: "path", x: 0, y: 0, lamp: true }]).ratio).toBe(0);
    expect(check(mealSlug, "lamp", [...unlit, { kind: "table", x: 6, y: 5, lamp: true }]).ratio).toBe(0);
    expect(result(mealSlug, [...unlit, { kind: "table", x: 6, y: 5, lamp: true }]).score).toBeLessThan(100);
  });

  test("removing table returns lamp inventory and invalidates the meal", () => {
    const placed = build(mealSlug);
    expect(usedInventory(placed, "lamp")).toBe(1);
    const removed = removeAt(levelFor(mealSlug), placed, { type: "cell", x: 4, y: 3 });
    expect(usedInventory(removed, "lamp")).toBe(0);
    expect(result(mealSlug, removed).score).toBeLessThan(100);
  });
});

describe("garden solitude", () => {
  test("Auto finds the planted north opening; manual south looks toward the crowd", () => {
    const bench = solution(gardenSlug).filter(isCellPiece).find((piece) => piece.kind === "bench")!;
    expect(resolveFacing(gardenSlug, layoutFor(gardenSlug), bench).direction).toBe("n");
    expect(check(gardenSlug, "view", setFacing(solution(gardenSlug), bench, "s")).ratio).toBe(0);
    expect(check(gardenSlug, "shelter", setFacing(solution(gardenSlug), bench, "s")).ratio).toBe(0);
    for (const facing of FACINGS) {
      const pieces = setFacing(solution(gardenSlug), bench, facing);
      expect(resolveFacing(gardenSlug, layoutFor(gardenSlug, pieces), pieces.filter(isCellPiece).find((piece) => piece.kind === "bench")!).direction).toBe(facing);
    }
  });

  test("east and west planted openings work with both Auto and explicit matching facings", () => {
    for (const direction of ["e", "w"] as const) {
      const plantX = direction === "e" ? 6 : 2;
      const backingX = direction === "e" ? 2 : 6;
      const pieces: Piece[] = [
        { kind: "bench", x: 4, y: 3 },
        { kind: "hedge", x: backingX, y: 3 },
        ...[2, 3, 4, 5, 6].map((x): Piece => ({ kind: "hedge", x, y: 5 })),
        { kind: "plant", x: plantX, y: 3 },
      ];
      const bench = pieces.filter(isCellPiece).find((piece) => piece.kind === "bench")!;
      expect(resolveFacing(gardenSlug, layoutFor(gardenSlug, pieces), bench).direction).toBe(direction);
      expect(result(gardenSlug, pieces).score).toBe(100);
      expect(result(gardenSlug, setFacing(pieces, bench, direction)).score).toBe(100);
      expect(check(gardenSlug, "view", setFacing(pieces, bench, direction === "e" ? "w" : "e")).ratio).toBe(0);
    }
  });

  test("back and side must be close and cardinal rather than diagonal", () => {
    const fixed = setFacing(solution(gardenSlug), { x: 4, y: 3 }, "n");
    expect(check(gardenSlug, "shelter", editCell(fixed, { x: 2, y: 3 }, (piece) => ({ ...piece, x: 1 } as Piece))).ratio).toBe(0);
    expect(check(gardenSlug, "shelter", editCell(fixed, { x: 2, y: 3 }, (piece) => ({ ...piece, y: 2 } as Piece))).ratio).toBe(0);
    expect(check(gardenSlug, "shelter", without(fixed, { x: 4, y: 5 })).ratio).toBe(0);
  });

  test("screening just the central promenade tile is not full privacy", () => {
    const pieces: Piece[] = [{ kind: "bench", x: 4, y: 3, facing: "n" }, { kind: "hedge", x: 4, y: 5 }, { kind: "hedge", x: 2, y: 3 }, { kind: "plant", x: 4, y: 1 }];
    expect(check(gardenSlug, "shelter", pieces).ratio).toBe(1);
    expect(check(gardenSlug, "privacy", pieces).ratio).toBe(0);
    expect(check(gardenSlug, "privacy", pieces).marks!.some((mark) => mark.tone === "bad" && mark.cell.y === 8 && mark.cell.x !== 4)).toBe(true);
  });

  test("screen gaps expose the bench and low plants do not screen it", () => {
    const gap = without(solution(gardenSlug), { x: 4, y: 5 });
    expect(check(gardenSlug, "privacy", gap).ratio).toBe(0);
    expect(badAt(check(gardenSlug, "privacy", gap), { x: 4, y: 3 })).toBe(true);
    expect(check(gardenSlug, "privacy", [...gap, { kind: "plant", x: 4, y: 5 }]).ratio).toBe(0);
  });

  test("visible south-light map and bench score agree for hedge and tree shadows", () => {
    for (const [piece, sunny] of [
      [{ kind: "hedge", x: 4, y: 4 }, false],
      [{ kind: "tree", x: 5, y: 6 }, false],
      [{ kind: "tree", x: 6, y: 6 }, true],
      [{ kind: "tree", x: 4, y: 7 }, true],
    ] as [Piece, boolean][]) {
      const pieces = [...solution(gardenSlug), piece];
      expect(gardenSunny(layoutFor(gardenSlug, pieces), { x: 4, y: 3 })).toBe(sunny);
      expect(check(gardenSlug, "sun", pieces).ratio).toBe(Number(sunny));
    }
  });

  test("front must be free and planting visible beyond it", () => {
    const fixed = setFacing(solution(gardenSlug), { x: 4, y: 3 }, "n");
    expect(check(gardenSlug, "view", [...fixed, { kind: "plant", x: 4, y: 2 }]).ratio).toBe(0);
    expect(check(gardenSlug, "view", without(fixed, { x: 4, y: 1 })).ratio).toBe(0);
    const blocked: Piece[] = [...editCell(fixed, { x: 4, y: 1 }, (piece) => ({ ...piece, y: 0 } as Piece)), { kind: "hedge", x: 4, y: 1 }];
    expect(check(gardenSlug, "view", blocked).ratio).toBe(0);
  });

  test("a green enclosure with an open front can still isolate its bench", () => {
    const pieces: Piece[] = [...solution(gardenSlug), { kind: "hedge", x: 3, y: 3 }, { kind: "hedge", x: 5, y: 3 }, { kind: "hedge", x: 3, y: 2 }, { kind: "hedge", x: 5, y: 2 }, { kind: "hedge", x: 4, y: 4 }];
    expect(check(gardenSlug, "view", pieces).ratio).toBe(1);
    expect(check(gardenSlug, "access", pieces).ratio).toBe(0);
  });

  test("paths are optional and adding an ordinary walk does not change the bench direction", () => {
    const placed = solution(gardenSlug);
    expect(usedInventory(placed, "path")).toBe(0);
    expect(result(gardenSlug).score).toBe(100);
    const paths: Piece[] = [...placed, { kind: "path", x: 4, y: 2 }, { kind: "path", x: 3, y: 3 }];
    expect(result(gardenSlug, paths).score).toBe(100);
  });

  test("two benches cannot combine distinct refuges into solitary completion", () => {
    expect(result(gardenSlug, [...solution(gardenSlug), { kind: "bench", x: 7, y: 1 }]).score).toBeLessThan(100);
  });
});

describe("trellised walk", () => {
  test("existing endpoints need no added stones and overhead attachments remain walkable", () => {
    const layout = layoutFor(walkSlug, build(walkSlug));
    expect(sceneEndpoints(layout)).toEqual([{ x: 0, y: 3 }, { x: 8, y: 3 }]);
    const component = reachable(freeFloor(layout, "plot"), [sceneEndpoints(layout)[0]]);
    expect(sceneEndpoints(layout).every((cell) => component.has(cellKey(cell)))).toBe(true);
    for (const piece of layout.pieces.filter(isCellPiece)) expect(component.has(cellKey(piece))).toBe(true);
    expect(usedInventory(layout.pieces, "trellis")).toBe(7);
    expect(usedInventory(layout.pieces, "plant")).toBe(7);
  });

  test("gap, diagonal-only replacement and occupied path tile break a continuous route", () => {
    const gap = without(solution(walkSlug), { x: 4, y: 3 });
    expect(check(walkSlug, "entries", gap).ratio).toBe(1);
    expect(check(walkSlug, "route", gap).ratio).toBe(0);
    expect(badAt(check(walkSlug, "route", gap), { x: 4, y: 3 })).toBe(true);
    expect(check(walkSlug, "route", [...gap, { kind: "path", x: 4, y: 2, trellis: true, climbingPlant: true }]).ratio).toBe(0);
    expect(check(walkSlug, "route", [...solution(walkSlug), { kind: "bench", x: 4, y: 3 }]).ratio).toBe(0);
  });

  test("blocked reserved endpoint is not made walkable by BFS", () => {
    const pieces: Piece[] = [...solution(walkSlug), { kind: "bench", x: 0, y: 3 }];
    expect(check(walkSlug, "entries", pieces).ratio).toBe(0.5);
    expect(check(walkSlug, "route", pieces).ratio).toBe(0);
  });

  test("missing roof and missing vine mark the actual route tile", () => {
    const bareRoof = editCell(solution(walkSlug), { x: 4, y: 3 }, (piece) => {
      const { trellis: _trellis, ...path } = piece as Extract<Piece, { x: number }>;
      return path;
    });
    expect(check(walkSlug, "cover", bareRoof).ratio).toBeCloseTo(6 / 7);
    expect(check(walkSlug, "vines", bareRoof).ratio).toBeCloseTo(6 / 7);
    expect(badAt(check(walkSlug, "cover", bareRoof), { x: 4, y: 3 })).toBe(true);
    const bareVine = editCell(solution(walkSlug), { x: 4, y: 3 }, (piece) => {
      const { climbingPlant: _plant, ...path } = piece as Extract<Piece, { x: number }>;
      return path;
    });
    expect(check(walkSlug, "cover", bareVine).ratio).toBe(1);
    expect(check(walkSlug, "vines", bareVine).ratio).toBeCloseTo(6 / 7);
    expect(badAt(check(walkSlug, "vines", bareVine), { x: 4, y: 3 })).toBe(true);
    expect(result(walkSlug, bareVine).score).toBeLessThan(100);
  });

  test("disconnected roofs and floor plants do not fill a route canopy gap", () => {
    const gap = without(solution(walkSlug), { x: 4, y: 3 });
    const pieces: Piece[] = [...gap, { kind: "path", x: 4, y: 3 }, { kind: "path", x: 4, y: 0, trellis: true, climbingPlant: true }, { kind: "plant", x: 4, y: 2 }];
    expect(check(walkSlug, "route", pieces).ratio).toBe(1);
    expect(check(walkSlug, "cover", pieces).ratio).toBeCloseTo(6 / 7);
    expect(check(walkSlug, "vines", pieces).ratio).toBeCloseTo(6 / 7);
  });

  test("a planted covered detour beats the shortest uncovered shortcut", () => {
    const detour: Cell[] = [{ x: 1, y: 3 }, ...Array.from({ length: 7 }, (_, i) => ({ x: i + 1, y: 2 })), { x: 7, y: 3 }];
    const pieces: Piece[] = [...detour.map((cell): Piece => ({ kind: "path", ...cell, trellis: true, climbingPlant: true })), ...[2, 3, 4, 5, 6].map((x): Piece => ({ kind: "path", x, y: 3 }))];
    expect(result(walkSlug, pieces).score).toBe(100);
    expect(result(walkSlug, [...pieces].reverse())).toEqual(result(walkSlug, pieces));
    expect(result(walkSlug, pieces).attractors.some((cell) => cell.y === 2)).toBe(true);
    expect(result(walkSlug, pieces).attractors.some((cell) => cell.x === 4 && cell.y === 3)).toBe(false);
  });

  test("disjoint route fragments cannot combine into complete checks", () => {
    const pieces = solution(walkSlug).map((piece): Piece => isCellPiece(piece) && piece.x >= 4 ? { ...piece, y: 1 } : piece);
    expect(result(walkSlug, pieces).score).toBeLessThan(100);
    expect(check(walkSlug, "route", pieces).ratio).toBe(0);
  });

  test("host removal returns all three inventory units and breaks the walk", () => {
    const placed = build(walkSlug);
    const removed = removeAt(levelFor(walkSlug), placed, { type: "cell", x: 4, y: 3 });
    for (const kind of ["path", "trellis", "plant"] as const) expect(usedInventory(removed, kind)).toBe(6);
    expect(check(walkSlug, "route", removed).ratio).toBe(0);
  });
});
