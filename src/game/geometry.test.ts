import { describe, expect, test } from "bun:test";
import { LEVELS } from "./levels";
import { migrateLegacyAlcoveSeats, placeAt, removeAt } from "./geometry";
import type { Piece } from "./types";

const level = LEVELS.find((candidate) => candidate.slug === "alcoves")!;
const alcove: Piece = { kind: "alcove", side: "n", pos: 0 };
const recessedSeat: Piece = { kind: "seat", x: 2, y: 1 };

describe("alcove floor geometry", () => {
  test("allows indoor furniture in an alcove's recessed cell", () => {
    expect(placeAt(level, [alcove], "seat", { type: "cell", x: 2, y: 1 })).toEqual([
      alcove,
      recessedSeat,
    ]);
  });

  test("rejects indoor furniture on ordinary outdoor cells", () => {
    expect(placeAt(level, [], "seat", { type: "cell", x: 2, y: 1 })).toBe(
      "A seat belongs inside the room.",
    );
  });

  test("removes furniture attached to a removed alcove", () => {
    expect(removeAt(level, [alcove, recessedSeat], { type: "wall", side: "n", pos: 0 })).toEqual([]);
  });

  test("moves legacy interior seats into their alcove once", () => {
    const legacySeat: Piece = { kind: "seat", x: 2, y: 2 };

    expect(migrateLegacyAlcoveSeats(level, [alcove, legacySeat])).toEqual([alcove, recessedSeat]);
  });
});
