import { describe, expect, test } from "bun:test";
import { LEVELS, evaluate } from "./levels";
import type { Layout, Piece } from "./types";

const level = LEVELS[0];
const windows: Piece[] = [
  { kind: "window", side: "n", pos: 0 },
  { kind: "window", side: "n", pos: 1 },
  { kind: "window", side: "n", pos: 2 },
  { kind: "window", side: "e", pos: 0 },
];

function layoutWith(...pieces: Piece[]): Layout {
  return { world: level.world, room: level.room, pieces: [...windows, ...pieces] };
}

describe("Light on Two Sides", () => {
  test("does not complete with only one well-lit seat", () => {
    const result = evaluate(level, layoutWith({ kind: "seat", x: 2, y: 2 }));

    expect(result.score).toBeLessThan(100);
    expect(result.checks.find((check) => check.id === "seats")?.ratio).toBe(0.5);
  });

  test("completes with both seats in overlapping light", () => {
    const result = evaluate(
      level,
      layoutWith(
        { kind: "seat", x: 2, y: 2 },
        { kind: "seat", x: 3, y: 2 },
      ),
    );

    expect(result.score).toBe(100);
  });
});
