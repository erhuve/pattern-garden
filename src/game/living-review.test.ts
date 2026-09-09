import { describe, expect, test } from "bun:test";
import { LIVING_LEVELS } from "./living-levels";
import { LIVING_SOLUTIONS } from "./living-solutions";
import { LEVELS, evaluate } from "./levels";
import { isFixedTarget, placeAt, removeAt, usedInventory } from "./geometry";
import { attachmentsAt, removeAttachment } from "./attachments";
import { isWallPiece, type Level, type Piece, type PieceKind } from "./types";
import { resolveFacing } from "./orientation";

const levelFor = (slug: string) => LIVING_LEVELS.find(level => level.slug === slug)!;

function build(level: Level, target: Piece[]): Piece[] {
  let placed: Piece[] = [];
  for (const piece of target) {
    if (level.starting.some(start => JSON.stringify(start) === JSON.stringify(piece))) {
      placed.push({ ...piece });
      continue;
    }
    const position = isWallPiece(piece) ? { type: "wall" as const, side: piece.side, pos: piece.pos } : { type: "cell" as const, x: piece.x, y: piece.y };
    const kinds: PieceKind[] = [piece.kind];
    if (piece.kind === "table" && piece.lamp) kinds.push("lamp");
    if (piece.kind === "path" && piece.trellis) kinds.push("trellis");
    if (piece.kind === "path" && piece.climbingPlant) kinds.push("plant");
    for (const kind of kinds) {
      const next = placeAt(level, placed, kind, position);
      if (typeof next === "string") throw new Error(`${kind}: ${next}`);
      placed = next;
    }
  }
  return placed;
}

describe("living level adversarial review regressions", () => {
  test("fixed dining entry cannot strand an otherwise complete saved layout", () => {
    const level = levelFor("eating-atmosphere");
    const pieces = build(level, LIVING_SOLUTIONS[level.slug]);
    const target = { type: "wall" as const, side: "n" as const, pos: 3 };
    expect(isFixedTarget(level, target)).toBe(true);
    expect(removeAt(level, pieces, target)).toBe(pieces);
    expect(evaluate(level, { ...level, pieces }).score).toBe(100);
    const original = LEVELS.find(level => level.slug === "light-on-two-sides")!;
    expect(isFixedTarget(original, target)).toBe(false);
    expect(removeAt(original, [{ kind: "door", side: "n", pos: 3 }], target)).toEqual([]);
  });

  test("a roofed and planted detour is legally buildable within the real palette", () => {
    const level = levelFor("trellised-walk");
    const detour = [{ x: 1, y: 3 }, ...Array.from({ length: 7 }, (_, i) => ({ x: i + 1, y: 2 })), { x: 7, y: 3 }];
    const target: Piece[] = [...detour.map(cell => ({ kind: "path" as const, ...cell, trellis: true as const, climbingPlant: true as const })), ...[2, 3, 4, 5, 6].map(x => ({ kind: "path" as const, x, y: 3 }))];
    const pieces = build(level, target);
    expect(usedInventory(pieces, "trellis")).toBe(9);
    expect(usedInventory(pieces, "plant")).toBe(9);
    expect(usedInventory(pieces, "path")).toBe(14);
    expect(evaluate(level, { ...level, pieces }).score).toBe(100);
  });

  test("low planting beneath the window does not turn a viewing seat away", () => {
    const level = levelFor("windows-overlooking-life");
    const pieces = build(level, [...LIVING_SOLUTIONS[level.slug], { kind: "plant", x: 3, y: 4 }]);
    const seat = pieces.find(piece => piece.kind === "seat" && piece.x === 3)!;
    if (isWallPiece(seat)) throw new Error("Expected seat");
    expect(resolveFacing(level.slug, { ...level, pieces }, seat).direction).toBe("s");
    expect(evaluate(level, { ...level, pieces }).score).toBe(100);
  });

  test("layer removal returns only the intended inventory and leaves other tiles intact", () => {
    const level = levelFor("trellised-walk");
    const pieces = build(level, LIVING_SOLUTIONS[level.slug]);
    const before = JSON.stringify(pieces);
    const cell = { x: 4, y: 3 };
    expect(attachmentsAt(pieces, cell)).toEqual(["climbingPlant", "trellis"]);
    const leafless = removeAttachment(pieces, cell, "climbingPlant");
    expect(usedInventory(leafless, "plant")).toBe(6);
    expect(usedInventory(leafless, "trellis")).toBe(7);
    expect(usedInventory(leafless, "path")).toBe(7);
    const uncovered = removeAttachment(pieces, cell, "trellis");
    expect(usedInventory(uncovered, "plant")).toBe(6);
    expect(usedInventory(uncovered, "trellis")).toBe(6);
    expect(usedInventory(uncovered, "path")).toBe(7);
    expect(JSON.stringify(pieces)).toBe(before);
    expect(uncovered.filter(p => !isWallPiece(p) && p.x !== 4)).toEqual(pieces.filter(p => !isWallPiece(p) && p.x !== 4));
  });

  test("attachment tools cannot create floating lamps, roofs or vines", () => {
    for (const [slug, kind] of [["eating-atmosphere", "lamp"], ["trellised-walk", "trellis"]] as const) {
      const level = levelFor(slug);
      const start = structuredClone(level.starting);
      expect(typeof placeAt(level, start, kind, { type: "cell", x: 4, y: 3 })).toBe("string");
      expect(start).toEqual(level.starting);
    }
    const level = levelFor("trellised-walk");
    const bare: Piece[] = [{ kind: "path", x: 4, y: 3 }];
    expect(typeof placeAt(level, bare, "plant", { type: "cell", x: 4, y: 3 })).toBe("string");
    expect(usedInventory(bare, "plant")).toBe(0);
  });
});
