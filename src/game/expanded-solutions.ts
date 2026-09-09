import type { Piece } from "./types";

export const EXPANDED_SOLUTIONS: Record<string, Piece[]> = {
  "front-door-bench": [
    { kind: "door", side: "s", pos: 2 },
    { kind: "bench", x: 3, y: 4 },
    { kind: "plant", x: 2, y: 4 },
    ...[4, 5, 6, 7].map((y): Piece => ({ kind: "path", x: 4, y })),
  ],
  "tree-places": [
    { kind: "tree", x: 4, y: 2 },
    { kind: "tree", x: 2, y: 4 },
    { kind: "tree", x: 6, y: 4 },
    { kind: "bench", x: 3, y: 3 },
    { kind: "bench", x: 5, y: 3 },
  ],
  "outdoor-room": [
    { kind: "table", x: 4, y: 4 },
    ...[2, 3, 4, 5, 6].map((x): Piece => ({ kind: "hedge", x, y: 2 })),
    ...[3, 4, 5, 6].flatMap((y): Piece[] => [{ kind: "hedge", x: 2, y }, { kind: "hedge", x: 6, y }]),
    { kind: "seat", x: 3, y: 3 },
    { kind: "seat", x: 5, y: 3 },
  ],
  "workspace-enclosure": [
    { kind: "door", side: "s", pos: 0 },
    { kind: "desk", x: 4, y: 4 },
    { kind: "seat", x: 4, y: 3 },
    { kind: "shelf", x: 4, y: 2 },
    { kind: "shelf", x: 3, y: 3 },
    { kind: "window", side: "e", pos: 1 },
  ],
};

export const EXPANDED_BUILD_SEQUENCES: Record<string, Piece[]> = Object.fromEntries(
  Object.entries(EXPANDED_SOLUTIONS).map(([slug, pieces]) => [slug, pieces.filter((piece) => piece.kind !== "door")]),
);
