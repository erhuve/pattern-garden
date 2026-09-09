import { describe, expect, test } from "bun:test";
import { EXPANDED_LEVELS } from "./expanded-levels";
import { EXPANDED_BUILD_SEQUENCES, EXPANDED_SOLUTIONS } from "./expanded-solutions";
import { evaluate } from "./levels";
import { interiorCell, placeAt, sameCell, usedInventory } from "./geometry";
import { cellKey, reachable } from "./place-rules";
import { isCellPiece, isWallPiece, type Cell, type Layout, type Level, type Piece, type Side } from "./types";

const levelFor = (slug: string) => EXPANDED_LEVELS.find((level) => level.slug === slug)!;
const solution = (slug: string): Piece[] => structuredClone(EXPANDED_SOLUTIONS[slug]);
const result = (slug: string, pieces: Piece[]) => evaluate(levelFor(slug), { ...levelFor(slug), pieces });
const ratio = (slug: string, pieces: Piece[], id: string) => result(slug, pieces).checks.find((check) => check.id === id)!.ratio;
const withoutCell = (pieces: Piece[], x: number, y: number) => pieces.filter((piece) => !isCellPiece(piece) || !sameCell(piece, { x, y }));
const shifted = (pieces: Piece[], dx: number, dy: number): Piece[] => pieces.map((piece) => isCellPiece(piece) ? { ...piece, x: piece.x + dx, y: piece.y + dy } : piece);

function rotate(layout: Layout): Layout {
  const turn = (cell: Cell): Cell => ({ x: layout.world.h - 1 - cell.y, y: cell.x });
  const nextSide: Record<Side, Side> = { n: "e", e: "s", s: "w", w: "n" };
  const room = { x: layout.world.h - layout.room.y - layout.room.h, y: layout.room.x, w: layout.room.h, h: layout.room.w };
  return {
    ...layout, room, world: { w: layout.world.h, h: layout.world.w },
    pieces: layout.pieces.map((piece) => {
      if (isCellPiece(piece)) return { ...piece, ...turn(piece) };
      const cell = turn(interiorCell(layout.room, piece));
      const side = nextSide[piece.side];
      return { ...piece, side, pos: side === "n" || side === "s" ? cell.x - room.x : cell.y - room.y };
    }),
  };
}

function build(level: Level, pieces: Piece[], start: Piece[] = []): Piece[] {
  let placed = structuredClone(start);
  for (const piece of pieces) {
    const target = isWallPiece(piece) ? { type: "wall" as const, side: piece.side, pos: piece.pos } : { type: "cell" as const, x: piece.x, y: piece.y };
    const next = placeAt(level, placed, piece.kind, target);
    expect(typeof next, `${level.slug}: ${JSON.stringify(piece)}: ${next}`).not.toBe("string");
    if (typeof next === "string") throw new Error(next);
    placed = next;
  }
  return placed;
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

describe("expanded level contracts", () => {
  test("four unique patterns use bounded palettes and documented adaptations", () => {
    expect(EXPANDED_LEVELS.map((level) => level.number)).toEqual([242, 171, 163, 183]);
    expect(new Set(EXPANDED_LEVELS.map((level) => level.slug)).size).toBe(4);
    for (const level of EXPANDED_LEVELS) {
      expect(level.palette.length).toBeLessThanOrEqual(6);
      expect(new Set(level.palette.map((entry) => entry.kind)).size).toBe(level.palette.length);
      expect(level.palette.every((entry) => Number.isInteger(entry.max) && entry.max > 0)).toBe(true);
      expect(level.adaptation!.length).toBeGreaterThan(40);
      for (const piece of EXPANDED_SOLUTIONS[level.slug]) expect(level.palette.some((entry) => entry.kind === piece.kind)).toBe(true);
      for (const entry of level.palette) expect(usedInventory(EXPANDED_SOLUTIONS[level.slug], entry.kind)).toBeLessThanOrEqual(entry.max);
    }
  });

  for (const level of EXPANDED_LEVELS) {
    test(`${level.slug}: fresh and empty are incomplete, every solution ratio is full`, () => {
      expect(result(level.slug, level.starting).score).toBeLessThan(100);
      expect(result(level.slug, []).score).toBeLessThan(100);
      const complete = result(level.slug, solution(level.slug));
      expect(complete.score).toBe(100);
      expect(complete.checks.every((check) => check.ratio === 1)).toBe(true);
      expect(complete.checks.length).toBeLessThanOrEqual(5);
      expect(complete.checks.reduce((sum, check) => sum + check.points, 0)).toBe(100);
      expect(complete.attractors.length).toBeGreaterThan(0);
    });

    test(`${level.slug}: known solution is buildable from reset and from empty`, () => {
      const fromReset = build(level, EXPANDED_BUILD_SEQUENCES[level.slug], level.starting);
      expect(fromReset).toEqual(EXPANDED_SOLUTIONS[level.slug]);
      expect(result(level.slug, fromReset).score).toBe(100);
      expect(result(level.slug, build(level, solution(level.slug))).score).toBe(100);
    });

    test(`${level.slug}: every reference piece has a real scoring purpose`, () => {
      const pieces = solution(level.slug);
      for (let i = 0; i < pieces.length; i++) {
        const incomplete = result(level.slug, pieces.filter((_, index) => i !== index));
        expect(incomplete.score, `removed ${JSON.stringify(pieces[i])}`).toBeLessThan(100);
        expect(incomplete.checks.some((check) => check.ratio < 1)).toBe(true);
      }
    });

    test(`${level.slug}: scoring is immutable, order independent and only street-facing benches depend on rotation`, () => {
      const layout = freeze({ ...level, pieces: solution(level.slug) });
      const before = JSON.stringify(layout);
      const expected = evaluate(level, layout);
      expect(JSON.stringify(layout)).toBe(before);
      expect(evaluate(level, { ...level, pieces: [...layout.pieces].reverse() })).toEqual(expected);
      for (const facing of ["n", "e", "s", "w"] as const) {
        const pieces = layout.pieces.map((piece) => isCellPiece(piece) ? { ...piece, facing } : { ...piece });
        if (level.slug === "front-door-bench" && facing !== level.street) {
          expect(result(level.slug, pieces).checks.find((item) => item.id === "view")?.ratio).toBe(0);
          expect(result(level.slug, pieces).score).toBe(80);
        } else {
          expect(result(level.slug, pieces)).toEqual(expected);
        }
      }
      for (let offset = 0; offset < layout.pieces.length; offset++) {
        const pieces = [...layout.pieces.slice(offset), ...layout.pieces.slice(0, offset)];
        expect(result(level.slug, pieces)).toEqual(expected);
      }
    });

    test(`${level.slug}: partial layouts have finite ratios, honest details and never round to 100`, () => {
      const pieces = solution(level.slug);
      for (let mask = 0; mask < 64; mask++) {
        const subset = pieces.filter((_, index) => (mask & (1 << (index % 6))) !== 0);
        const current = result(level.slug, subset);
        expect(current.checks.every((check) => Number.isFinite(check.ratio) && check.ratio >= 0 && check.ratio <= 1 && check.detail.length > 0)).toBe(true);
        expect(current.score === 100).toBe(current.checks.every((check) => check.ratio === 1));
      }
    });
  }

  test("strict flood fill never adds blocked starts or jumps diagonally", () => {
    const cells = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 3, y: 2 }];
    expect(reachable(cells, [{ x: 0, y: 0 }]).size).toBe(0);
    expect([...reachable(cells, [{ x: 1, y: 0 }])]).toEqual(["1,0", "1,1"]);
    expect(reachable(cells, [{ x: 1, y: 0 }]).has(cellKey({ x: 3, y: 2 }))).toBe(false);
  });

  test("garden and workspace rules work in all four geometric orientations", () => {
    for (const slug of ["tree-places", "outdoor-room", "workspace-enclosure"]) {
      const level = levelFor(slug);
      let layout: Layout = { ...level, pieces: solution(slug) };
      for (let i = 0; i < 4; i++) {
        expect(evaluate(level, layout).score, `${slug}, quarter-turn ${i}`).toBe(100);
        layout = rotate(layout);
      }
    }
  });
});

describe("Front Door Bench", () => {
  const slug = "front-door-bench";
  test("the bench must be against the same facade and within two cardinal steps", () => {
    const base = solution(slug).filter((piece) => piece.kind !== "bench");
    for (const cell of [{ x: 1, y: 3 }, { x: 3, y: 5 }, { x: 7, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 3 }]) {
      expect(ratio(slug, [...base, { kind: "bench", ...cell }], "bench")).toBe(0);
    }
    const movedDoor = solution(slug).map((piece): Piece => piece.kind === "door" ? { kind: "door", side: "w", pos: 2 } : piece);
    expect(ratio(slug, movedDoor, "bench")).toBe(0);
  });

  test("all four garden stones, including the doorstep and road-adjacent tile, are required", () => {
    for (const y of [4, 5, 6, 7]) {
      expect(ratio(slug, withoutCell(solution(slug), 4, y), "path")).toBe(0);
    }
  });

  test("path endpoints cannot be auto-added over furniture or planting", () => {
    const blocked = [...withoutCell(solution(slug), 4, 4), { kind: "plant", x: 4, y: 4 } as Piece];
    expect(ratio(slug, blocked, "door")).toBe(0);
    expect(ratio(slug, blocked, "path")).toBe(0);
    const blockedInterior = [...solution(slug), { kind: "plant", x: 4, y: 3 } as Piece];
    expect(ratio(slug, blockedInterior, "door")).toBe(0);
    expect(ratio(slug, blockedInterior, "path")).toBe(0);
    const overlap = [...solution(slug), { kind: "hedge", x: 4, y: 8 } as Piece];
    expect(ratio(slug, overlap, "path")).toBe(0);
  });

  test("the street route must also reach the front of the bench", () => {
    expect(ratio(slug, [...solution(slug), { kind: "plant", x: 3, y: 5 }], "path")).toBe(0);
    expect(ratio(slug, [...solution(slug), { kind: "plant", x: 3, y: 5 }], "view")).toBe(0);
    const fixed = solution(slug).map((piece): Piece => piece.kind === "bench" ? { ...piece, facing: "s" } : piece);
    expect(ratio(slug, [...fixed, { kind: "plant", x: 3, y: 5 }], "view")).toBe(1);
    expect(ratio(slug, [...fixed, { kind: "plant", x: 3, y: 5 }], "path")).toBe(0);
  });

  test("trees and hedges block the street sight line even on the far street edge", () => {
    for (const kind of ["tree", "hedge"] as const) {
      for (const y of [5, 7, 8]) expect(ratio(slug, [...solution(slug), { kind, x: 3, y }], "view")).toBe(0);
    }
    const north = solution(slug).map((piece): Piece => piece.kind === "bench" ? { kind: "bench", x: 3, y: 0 } : piece);
    expect(ratio(slug, north, "view")).toBe(0);
  });

  test("privacy must be a neighboring outdoor side or back, never the front or diagonal", () => {
    const base = solution(slug).filter((piece) => piece.kind !== "plant");
    for (const cell of [{ x: 2, y: 5 }, { x: 3, y: 5 }, { x: 3, y: 3 }]) expect(ratio(slug, [...base, { kind: "plant", ...cell }], "privacy")).toBe(0);
    for (const kind of ["plant", "tree", "hedge"] as const) expect(result(slug, [...base, { kind, x: 2, y: 4 }]).score).toBe(100);
  });
});

describe("Tree Places", () => {
  const slug = "tree-places";
  test("a row of trees is not a grove", () => {
    const pieces: Piece[] = [
      { kind: "tree", x: 2, y: 3 }, { kind: "tree", x: 4, y: 3 }, { kind: "tree", x: 6, y: 3 },
      { kind: "bench", x: 3, y: 4 }, { kind: "bench", x: 5, y: 4 },
    ];
    expect(ratio(slug, pieces, "grove")).toBe(0);
    expect(result(slug, pieces).score).toBeLessThan(100);
  });

  test("a diagonal line cannot manufacture three cardinal sides", () => {
    const pieces: Piece[] = [
      { kind: "tree", x: 2, y: 2 }, { kind: "tree", x: 4, y: 4 }, { kind: "tree", x: 6, y: 6 },
      { kind: "bench", x: 3, y: 3 }, { kind: "bench", x: 5, y: 5 },
    ];
    expect(result(slug, pieces).score).toBeLessThan(100);
  });

  test("distant shade and a separate grove cannot satisfy different checks", () => {
    const pieces: Piece[] = [
      { kind: "tree", x: 2, y: 0 }, { kind: "tree", x: 0, y: 2 }, { kind: "tree", x: 4, y: 2 },
      { kind: "tree", x: 6, y: 6 }, { kind: "bench", x: 5, y: 6 }, { kind: "bench", x: 7, y: 6 },
    ];
    const checks = result(slug, pieces).checks;
    expect(checks.find((check) => check.id === "grove")!.ratio === 1 && checks.find((check) => check.id === "shade")!.ratio === 1).toBe(false);
    expect(result(slug, pieces).score).toBeLessThan(100);
  });

  test("separate groves cannot combine their benches", () => {
    const pieces = [...shifted(solution(slug).filter((p) => p.kind !== "bench" || p.x === 3), -2, -1), ...shifted(solution(slug).filter((p) => p.kind !== "bench" || p.x === 5), 1, 3)];
    expect(ratio(slug, pieces, "shade")).toBeLessThan(1);
  });

  test("every placed bench must share the center, even if two others are good", () => {
    expect(ratio(slug, [...solution(slug), { kind: "bench", x: 8, y: 8 }], "shade")).toBeLessThan(1);
  });

  test("trunks block access, but canopy cells and optional paths remain walkable", () => {
    const boxed = [...solution(slug), { kind: "plant", x: 3, y: 2 } as Piece, { kind: "plant", x: 2, y: 3 } as Piece, { kind: "plant", x: 4, y: 3 } as Piece, { kind: "tree", x: 3, y: 4 } as Piece];
    expect(ratio(slug, boxed, "access")).toBeLessThan(1);
    expect(result(slug, [...solution(slug), { kind: "path", x: 4, y: 4 }, { kind: "plant", x: 0, y: 0 }]).score).toBe(100);
  });

  test("tree counts alone do not complete and attractors need a real grove", () => {
    const trees = solution(slug).filter((piece) => piece.kind === "tree");
    expect(result(slug, trees).score).toBeLessThan(100);
    expect(result(slug, trees).attractors).toEqual([]);
  });
});

describe("Outdoor Room", () => {
  const slug = "outdoor-room";
  test("scattered hedges or four decorative plants do not define complete sides", () => {
    const furnished = solution(slug).filter((piece) => piece.kind !== "hedge");
    const pieces: Piece[] = [...furnished, ...[{ x: 4, y: 2 }, { x: 2, y: 4 }, { x: 6, y: 4 }, { x: 4, y: 6 }].map((cell): Piece => ({ kind: "hedge", ...cell }))];
    expect(ratio(slug, pieces, "walls")).toBe(0);
    expect(result(slug, pieces).attractors).toEqual([]);
    expect(ratio(slug, solution(slug).map((piece): Piece => piece.kind === "hedge" ? { ...piece, kind: "plant" } : piece), "walls")).toBe(0);
  });

  test("three complete sides use thirteen hedges and closing the fourth fails access", () => {
    expect(solution(slug).filter((piece) => piece.kind === "hedge").length).toBe(13);
    const sealed: Piece[] = [...solution(slug), ...[3, 4, 5].map((x): Piece => ({ kind: "hedge", x, y: 6 }))];
    expect(ratio(slug, sealed, "walls")).toBe(1);
    expect(ratio(slug, sealed, "entrance")).toBe(0);
    expect(ratio(slug, sealed, "access")).toBe(0);
    expect(result(slug, sealed).attractors).toEqual([]);
  });

  test("an opening occupied by furniture is not automatically a walkable endpoint", () => {
    const blocked: Piece[] = [...solution(slug), { kind: "hedge", x: 3, y: 6 }, { kind: "hedge", x: 5, y: 6 }, { kind: "plant", x: 4, y: 6 }];
    expect(ratio(slug, blocked, "entrance")).toBe(0);
    const gap = blocked.filter((piece) => piece.kind !== "plant");
    expect(result(slug, gap).score).toBe(100);
    expect(ratio(slug, [...gap, { kind: "plant", x: 4, y: 5 }], "entrance")).toBe(0);
    expect(ratio(slug, [...gap, { kind: "plant", x: 4, y: 7 }], "entrance")).toBe(0);
  });

  test("boxed-in seating fails even when the frame and entrance are sound", () => {
    const pieces: Piece[] = [...solution(slug), { kind: "plant", x: 4, y: 3 }, { kind: "plant", x: 3, y: 4 }];
    expect(ratio(slug, pieces, "walls")).toBe(1);
    expect(ratio(slug, pieces, "entrance")).toBe(1);
    expect(ratio(slug, pieces, "access")).toBe(0.5);
    expect(result(slug, pieces).score).toBeLessThan(100);
  });

  test("seats reached from different inner-floor components cannot combine", () => {
    const base = solution(slug).filter((piece) => piece.kind !== "seat");
    const pieces: Piece[] = [...base, { kind: "seat", x: 3, y: 3 }, { kind: "seat", x: 5, y: 3 }, { kind: "plant", x: 4, y: 3 }, { kind: "plant", x: 4, y: 5 }];
    expect(ratio(slug, pieces, "entrance")).toBe(1);
    expect(ratio(slug, pieces, "access")).toBe(0.5);
  });

  test("all seats must be inside the same room and a clipped frame is not a room", () => {
    expect(ratio(slug, [...solution(slug), { kind: "seat", x: 0, y: 0 }], "seats")).toBeLessThan(1);
    expect(ratio(slug, shifted(solution(slug), -3, 0), "room")).toBe(0);
    expect(ratio(slug, solution(slug).map((piece): Piece => piece.kind === "table" ? { kind: "table", x: 5, y: 4 } : piece), "walls")).toBeLessThan(1);
  });

  test("an entrance on the plot boundary needs no imaginary off-board floor tile", () => {
    const pieces = shifted(solution(slug), 0, 2);
    expect(result(slug, build(levelFor(slug), pieces)).score).toBe(100);
    const narrowed: Piece[] = [...pieces, { kind: "hedge", x: 3, y: 8 }, { kind: "hedge", x: 5, y: 8 }];
    expect(result(slug, narrowed).score).toBe(100);
    expect(ratio(slug, [...narrowed, { kind: "plant", x: 4, y: 8 }], "entrance")).toBe(0);
  });

  test("ornamental paths and plants are not quotas", () => {
    expect(result(slug, [...solution(slug), { kind: "plant", x: 0, y: 0 }, { kind: "path", x: 4, y: 6 }]).score).toBe(100);
  });
});

describe("Workspace Enclosure", () => {
  const slug = "workspace-enclosure";
  test("a diagonal or distant chair is not a work pair", () => {
    for (const cell of [{ x: 5, y: 3 }, { x: 4, y: 2 }]) {
      const pieces = solution(slug).map((piece): Piece => piece.kind === "seat" ? { kind: "seat", ...cell } : piece);
      expect(ratio(slug, pieces, "pair")).toBe(0);
      expect(result(slug, pieces).score).toBeLessThan(100);
    }
  });

  test("shelves must immediately protect the back and a side, not merely be nearby", () => {
    expect(ratio(slug, solution(slug).filter((piece) => piece.kind !== "shelf"), "privacy")).toBe(0);
    const nearby = solution(slug).map((piece): Piece => piece.kind === "shelf" && piece.x === 3 ? { kind: "shelf", x: 2, y: 3 } : piece);
    expect(ratio(slug, nearby, "privacy")).toBe(0);
    expect(ratio(slug, [...solution(slug).filter((piece) => piece.kind !== "shelf"), { kind: "plant", x: 4, y: 2 }, { kind: "plant", x: 3, y: 3 }], "privacy")).toBe(0);
  });

  test("a solid room wall can protect the back but a window alone cannot", () => {
    const pieces: Piece[] = [
      { kind: "door", side: "s", pos: 0 }, { kind: "seat", x: 4, y: 2 }, { kind: "desk", x: 4, y: 3 },
      { kind: "shelf", x: 3, y: 2 }, { kind: "window", side: "e", pos: 0 },
    ];
    expect(result(slug, pieces).score).toBe(100);
    expect(ratio(slug, [...pieces, { kind: "window", side: "n", pos: 2 }], "privacy")).toBe(0);
    expect(ratio(slug, [...pieces, { kind: "door", side: "n", pos: 2 }], "privacy")).toBe(0);
  });

  test("half-weight glazing can satisfy enclosure but is never a walkable opening", () => {
    const pieces: Piece[] = [
      { kind: "door", side: "s", pos: 0 }, { kind: "seat", x: 7, y: 2 }, { kind: "desk", x: 7, y: 3 },
      { kind: "shelf", x: 6, y: 2 }, { kind: "window", side: "e", pos: 0 },
    ];
    expect(ratio(slug, pieces, "privacy")).toBe(1);
    expect(result(slug, pieces).checks.find((check) => check.id === "privacy")!.detail).toContain("2.5");
    expect(ratio(slug, pieces, "circulation")).toBe(0);
    expect(result(slug, pieces).score).toBeLessThan(100);
  });

  test("the open front needs two clear floor cells, not planting or a dead-end slit", () => {
    for (const y of [5, 6]) expect(ratio(slug, [...solution(slug), { kind: "plant", x: 4, y }], "front")).toBe(0);
    const narrow = [...solution(slug), ...[3, 5].flatMap((x): Piece[] => [{ kind: "shelf", x, y: 5 }, { kind: "shelf", x, y: 6 }])];
    expect(ratio(slug, narrow, "front")).toBe(0);
  });

  test("a real aligned window is required and shelves occlude the whole sight ray", () => {
    expect(ratio(slug, solution(slug).filter((piece) => piece.kind !== "window"), "view")).toBe(0);
    for (const x of [5, 6, 7]) expect(ratio(slug, [...solution(slug), { kind: "shelf", x, y: 3 }], "view")).toBe(0);
    const wrongRow = solution(slug).map((piece): Piece => piece.kind === "window" ? { kind: "window", side: "e", pos: 2 } : piece);
    expect(ratio(slug, wrongRow, "view")).toBe(0);
    const behind = solution(slug).map((piece): Piece => piece.kind === "window" ? { kind: "window", side: "n", pos: 2 } : piece);
    expect(ratio(slug, behind, "view")).toBe(0);
  });

  test("the worker can look forward over their own desk, but not another desk", () => {
    const frontWindow = solution(slug).map((piece): Piece => piece.kind === "window" ? { kind: "window", side: "s", pos: 2 } : piece);
    expect(result(slug, frontWindow).score).toBe(100);
    expect(ratio(slug, [...frontWindow, { kind: "desk", x: 4, y: 5 }], "view")).toBe(0);
  });

  test("door thresholds and chair approaches are genuine unoccupied floor", () => {
    for (const cell of [{ x: 2, y: 6 }, { x: 2, y: 7 }, { x: 5, y: 3 }]) {
      expect(ratio(slug, [...solution(slug), { kind: "plant", ...cell }], "circulation")).toBe(0);
    }
    expect(ratio(slug, solution(slug).filter((piece) => piece.kind !== "door"), "circulation")).toBe(0);
  });

  test("a shelf barrier disconnects work from the door without fabricating endpoints", () => {
    const pieces: Piece[] = [...solution(slug), { kind: "shelf", x: 3, y: 6 }, { kind: "shelf", x: 2, y: 5 }];
    expect(ratio(slug, pieces, "circulation")).toBe(0);
    expect(result(slug, pieces).attractors).toEqual([]);
  });

  test("different chairs cannot combine the privacy of one with the view of another", () => {
    const pieces: Piece[] = [
      { kind: "door", side: "s", pos: 0 }, { kind: "desk", x: 4, y: 4 },
      { kind: "seat", x: 4, y: 3 }, { kind: "shelf", x: 4, y: 2 }, { kind: "shelf", x: 3, y: 3 },
      { kind: "seat", x: 5, y: 4 }, { kind: "window", side: "e", pos: 2 },
    ];
    expect(result(slug, pieces).score).toBeLessThan(100);
    expect(result(slug, [...pieces].reverse())).toEqual(result(slug, pieces));
  });
});
