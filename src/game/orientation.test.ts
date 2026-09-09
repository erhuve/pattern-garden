import { describe, expect, test } from "bun:test";
import type { CellPiece, Layout, Piece, Side } from "./types";
import { automaticFacing, FACINGS, resolveFacing, setFacing } from "./orientation";
import { alcoveCell, interiorCell, migrateLegacyAlcoveSeats, removeAt } from "./geometry";
import { evaluate, LEVELS } from "./levels";
import { rotateXY } from "./DirectionalGlyph";

const seat = (x: number, y: number): CellPiece => ({ kind: "seat", x, y });
const layout = (pieces: Piece[]): Layout => ({ world: { w: 9, h: 8 }, room: { x: 2, y: 2, w: 5, h: 4 }, pieces });
const direction = (pieces: Piece[], piece: CellPiece, slug = "light-on-two-sides") => automaticFacing(slug, layout(pieces), piece).direction;

describe("context-aware orientation", () => {
  test("chairs by each wall face into the room, without facing a bare wall", () => {
    for (const [x, y, expected] of [[4, 2, "s"], [4, 5, "n"], [2, 3, "e"], [6, 3, "w"]] as const) {
      const s = seat(x, y);
      expect(direction([s], s)).toBe(expected);
    }
  });

  test("chairs around a hearth face the center including diagonal scoring-radius seats", () => {
    const hearth: CellPiece = { kind: "hearth", x: 4, y: 3 };
    for (const [x, y, expected] of [[4, 2, "s"], [5, 3, "w"], [4, 4, "n"], [3, 3, "e"], [6, 5, "n"]] as const) {
      const s = seat(x, y);
      expect(direction([s, hearth], s, "sitting-circle")).toBe(expected);
    }
  });

  test("a hidden hearth does not suppress a reachable table", () => {
    const s = seat(4, 4);
    const pieces: Piece[] = [s, { kind: "hearth", x: 4, y: 2 }, { kind: "shelf", x: 4, y: 3 }, { kind: "table", x: 3, y: 4 }];
    expect(direction(pieces, s, "sitting-circle")).toBe("w");
    expect(automaticFacing("sitting-circle", layout(pieces), s).reason).toContain("table");
  });

  test("chairs do not face a blocked table through a bookshelf", () => {
    const s = seat(3, 3);
    const pieces: Piece[] = [s, { kind: "table", x: 5, y: 3 }, { kind: "shelf", x: 4, y: 3 }];
    expect(direction(pieces, s)).not.toBe("e");
    expect(automaticFacing("light-on-two-sides", layout(pieces), s).reason).not.toContain("table");
  });

  test("nearby chairs face one another, not array insertion order", () => {
    const a = seat(3, 3), b = seat(5, 3);
    expect(direction([a, b], a)).toBe("e");
    expect(direction([b, a], b)).toBe("w");
  });

  test("window seats use only real glazing on their own wall cell", () => {
    const s = seat(4, 2);
    const window: Piece = { kind: "window", side: "n", pos: 2 };
    expect(direction([s, window], s, "window-place")).toBe("n");
    expect(direction([s, window], s)).toBe("s");
    expect(direction([s, { ...window, pos: 1 }], s, "window-place")).toBe("s");
  });

  test("all four alcove sides face the opening and describe blocked openings honestly", () => {
    const opposite: Record<Side, Side> = { n: "s", s: "n", w: "e", e: "w" };
    for (const side of FACINGS) {
      const wall: Piece = { kind: "alcove", side, pos: 1 };
      const s = seat(...Object.values(alcoveCell(layout([]).room, wall)) as [number, number]);
      expect(direction([wall, s], s, "alcoves")).toBe(opposite[side]);
      const shelf: Piece = { kind: "shelf", ...interiorCell(layout([]).room, wall) };
      const result = automaticFacing("alcoves", layout([wall, s, shelf]), s);
      expect(result.direction).toBe(opposite[side]);
      expect(result.reason).toContain("blocks");
    }
  });

  test("a trapped corner chair chooses obstructed indoor space rather than a solid wall", () => {
    const s = seat(2, 2);
    const result = automaticFacing("light-on-two-sides", layout([s, { kind: "shelf", x: 3, y: 2 }, { kind: "plant", x: 2, y: 3 }]), s);
    expect(["e", "s"]).toContain(result.direction);
    expect(result.reason).toContain("No clear front");
  });

  test("shelves put their closed back against each bare wall", () => {
    for (const [x, y, expected] of [[4, 2, "s"], [4, 5, "n"], [2, 3, "e"], [6, 3, "w"]] as const) {
      const shelf: CellPiece = { kind: "shelf", x, y };
      expect(direction([shelf], shelf)).toBe(expected);
    }
  });

  test("standalone shelves open toward accessible seating", () => {
    const shelf: CellPiece = { kind: "shelf", x: 4, y: 3 };
    expect(direction([shelf, seat(3, 3)], shelf)).toBe("w");
  });

  test("gate passage aligns with straight path in both axes", () => {
    const gate: CellPiece = { kind: "gate", x: 4, y: 7 };
    expect(["e", "w"]).toContain(direction([gate, { kind: "path", x: 3, y: 7 }, { kind: "path", x: 5, y: 7 }], gate, "entrance-transition"));
    expect(direction([gate, { kind: "path", x: 4, y: 6 }], gate, "entrance-transition")).toBe("n");
  });

  test("connected gate path outranks disconnected neighbors", () => {
    const gate: CellPiece = { kind: "gate", x: 4, y: 7 };
    const pieces: Piece[] = [gate, { kind: "door", side: "s", pos: 2 }, ...[[3, 7], [5, 7], [4, 6]].map(([x, y]): Piece => ({ kind: "path", x, y }))];
    expect(direction(pieces, gate, "entrance-transition")).toBe("n");
    expect(automaticFacing("entrance-transition", layout(pieces), gate).reason).toContain("connected");
  });

  test("same final layout yields identical facing, with deterministic ties and no mutation", () => {
    const s = seat(4, 3);
    const pieces: Piece[] = [s, seat(5, 3), seat(3, 3), { kind: "table", x: 4, y: 4 }, { kind: "shelf", x: 6, y: 4 }];
    const before = JSON.stringify(pieces);
    for (let i = 0; i < pieces.length; i++) {
      const shuffled = [...pieces.slice(i), ...pieces.slice(0, i)].reverse();
      for (const p of pieces.filter((p): p is CellPiece => "x" in p)) {
        expect(direction(shuffled, p)).toBe(direction(pieces, p));
      }
    }
    expect(JSON.stringify(pieces)).toBe(before);
    expect(pieces.some(p => "facing" in p)).toBe(false);
  });

  test("symmetric objects and walls ignore rotation; invalid directions never persist", () => {
    const pieces: Piece[] = [{ kind: "table", x: 4, y: 3 }, { kind: "window", side: "n", pos: 0 }];
    expect(setFacing(pieces, { x: 4, y: 3 }, "w")).toEqual(pieces);
    const s = seat(4, 3);
    expect(setFacing([s], s, "bad" as Side)).toEqual([s]);
    expect(resolveFacing("alcoves", layout([s]), { ...s, facing: "bad" as Side }).manual).toBe(false);
  });

  test("fixed directions persist across furniture changes, Auto removes the override", () => {
    const s = seat(4, 3);
    const pinned = setFacing([s], s, "w");
    const restored = JSON.parse(JSON.stringify(pinned)) as CellPiece[];
    expect(resolveFacing("alcoves", layout([...restored, { kind: "table", x: 5, y: 3 }]), restored[0])).toMatchObject({ direction: "w", manual: true });
    const auto = setFacing(restored, s, "auto") as CellPiece[];
    expect(auto[0]).not.toHaveProperty("facing");
    expect(resolveFacing("alcoves", layout([...auto, { kind: "table", x: 5, y: 3 }]), auto[0]).direction).toBe("e");
  });

  test("manual edits preserve legacy levels' scores, checks, coordinates, order and inventory", () => {
    const pieces: Piece[] = [seat(3, 2), seat(3, 3), { kind: "window", side: "n", pos: 1 }, { kind: "window", side: "e", pos: 1 }, { kind: "shelf", x: 5, y: 3 }, { kind: "gate", x: 0, y: 7 }];
    for (const level of LEVELS.filter((level) => !level.scene)) {
      const original = { ...layout(pieces), room: level.room, world: level.world };
      for (const p of pieces.filter((p): p is CellPiece => "x" in p)) {
        for (const side of FACINGS) {
          const modified = setFacing(pieces, p, side);
          const before = evaluate(level, original);
          const after = evaluate(level, { ...original, pieces: modified });
          expect(after.score).toEqual(before.score);
          expect(after.checks).toEqual(before.checks);
          expect(after.attractors.map(({ x, y }) => ({ x, y }))).toEqual(before.attractors.map(({ x, y }) => ({ x, y })));
          expect((after.unhappy ?? []).map(({ x, y }) => ({ x, y }))).toEqual((before.unhappy ?? []).map(({ x, y }) => ({ x, y })));
          expect(modified.map(({ facing: _, ...other }: any) => other)).toEqual(pieces);
        }
      }
    }
  });

  test("rotated alcove furniture still removes with its pocket", () => {
    const level = LEVELS.find(l => l.slug === "alcoves")!;
    const wall: Piece = { kind: "alcove", side: "n", pos: 1 };
    const s: CellPiece = { kind: "seat", ...alcoveCell(level.room, wall), facing: "s" };
    expect(removeAt(level, [wall, s], { type: "wall", side: "n", pos: 1 })).toEqual([]);
    expect(migrateLegacyAlcoveSeats(level, [wall, { kind: "seat", ...interiorCell(level.room, wall) }])).toContainEqual({ kind: "seat", ...alcoveCell(level.room, wall) });
  });

  test("yaw rotates XY while preserving upright geometry", () => {
    expect(FACINGS.map(s => rotateXY(0, 1, s))).toEqual([{ x: -0, y: -1 }, { x: 1, y: -0 }, { x: 0, y: 1 }, { x: -1, y: 0 }]);
    for (const side of FACINGS) expect(Math.hypot(...Object.values(rotateXY(0.3, 0.5, side)))).toBeCloseTo(Math.hypot(0.3, 0.5));
  });
});
