import type { PlaceTarget } from "./geometry";
import { isWallPiece, type Piece, type PieceKind } from "./types";

export const LIVING_SOLUTIONS: Record<string, Piece[]> = {
  "windows-overlooking-life": [
    { kind: "door", side: "n", pos: 2 },
    { kind: "window", side: "s", pos: 1 },
    { kind: "window", side: "s", pos: 3 },
    { kind: "seat", x: 3, y: 3 },
    { kind: "seat", x: 5, y: 3 },
  ],
  "eating-atmosphere": [
    { kind: "door", side: "n", pos: 3 },
    { kind: "table", x: 4, y: 3, lamp: true },
    { kind: "seat", x: 4, y: 2 },
    { kind: "seat", x: 5, y: 3 },
    { kind: "seat", x: 4, y: 4 },
    { kind: "seat", x: 3, y: 3 },
  ],
  "garden-seat": [
    { kind: "bench", x: 4, y: 3 },
    { kind: "hedge", x: 2, y: 3 },
    ...[2, 3, 4, 5, 6].map((x): Piece => ({ kind: "hedge", x, y: 5 })),
    { kind: "plant", x: 4, y: 1 },
  ],
  "trellised-walk": Array.from({ length: 7 }, (_, i): Piece => ({ kind: "path", x: i + 1, y: 3, trellis: true, climbingPlant: true })),
};

export type LivingPlacement = { kind: PieceKind; target: PlaceTarget };

export const LIVING_BUILD_SEQUENCES: Record<string, LivingPlacement[]> = Object.fromEntries(
  Object.entries(LIVING_SOLUTIONS).map(([slug, pieces]) => [slug, pieces.filter((piece) => piece.kind !== "door").flatMap((piece): LivingPlacement[] => {
    if (isWallPiece(piece)) return [{ kind: piece.kind, target: { type: "wall", side: piece.side, pos: piece.pos } }];
    const target: PlaceTarget = { type: "cell", x: piece.x, y: piece.y };
    return [
      { kind: piece.kind, target },
      ...(piece.kind === "table" && piece.lamp ? [{ kind: "lamp" as const, target }] : []),
      ...(piece.kind === "path" && piece.trellis ? [{ kind: "trellis" as const, target }] : []),
      ...(piece.kind === "path" && piece.trellis && piece.climbingPlant ? [{ kind: "plant" as const, target }] : []),
    ];
  })]),
);
