import type { Cell, CellPiece, Layout, Piece, Side } from "./types";
import { isCellPiece } from "./types";
import { alcoveAt, cellPieces, chebyshev, exteriorCell, connectedPath, inRoom, interiorCell, inWorld, manhattan, sameCell, wallPieces } from "./geometry";

export const FACINGS: readonly Side[] = ["n", "e", "s", "w"];
export const VECTORS: Record<Side, Cell> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
export const FACING_LABELS: Record<Side, string> = { n: "Upper right", e: "Lower right", s: "Lower left", w: "Upper left" };
const OPPOSITE: Record<Side, Side> = { n: "s", e: "w", s: "n", w: "e" };
export type Facing = { direction: Side; reason: string; manual: boolean };

export function isFacing(value: unknown): value is Side {
  return typeof value === "string" && FACINGS.includes(value as Side);
}

export function isDirectional(piece: Piece): piece is CellPiece {
  return isCellPiece(piece) && (piece.kind === "seat" || piece.kind === "shelf" || piece.kind === "gate");
}

export function setFacing(pieces: Piece[], cell: Cell, direction: Side | "auto"): Piece[] {
  if (direction !== "auto" && !isFacing(direction)) return pieces;
  return pieces.map((piece) => {
    if (!isDirectional(piece) || !sameCell(piece, cell)) return piece;
    const { facing: _facing, ...auto } = piece;
    return direction === "auto" ? auto : { ...auto, facing: direction };
  });
}

function nextCell(cell: Cell, direction: Side): Cell {
  const vector = VECTORS[direction];
  return { x: cell.x + vector.x, y: cell.y + vector.y };
}

function indoor(layout: Layout, cell: Cell): boolean {
  return inRoom(layout.room, cell) || Boolean(alcoveAt(layout.room, layout.pieces, cell));
}

function glazing(layout: Layout, cell: Cell, direction: Side): boolean {
  return wallPieces(layout).some((wall) => wall.kind === "window" && wall.side === direction && sameCell(interiorCell(layout.room, wall), cell));
}

function safeFront(layout: Layout, piece: CellPiece, direction: Side, viewWindow: boolean): boolean {
  const next = nextCell(piece, direction);
  if (!inWorld(layout.world, next)) return false;
  if (piece.kind !== "gate" && !indoor(layout, next)) return viewWindow && glazing(layout, piece, direction);
  if (piece.kind === "gate" && indoor(layout, next)) return false;
  const obstacle = cellPieces(layout).find((other) => sameCell(other, next));
  if (!obstacle) return true;
  if (piece.kind === "gate") return obstacle.kind === "path";
  if (piece.kind === "shelf") return obstacle.kind === "seat";
  return obstacle.kind === "seat" || obstacle.kind === "table" || obstacle.kind === "hearth";
}

function clearView(layout: Layout, from: Cell, to: Cell): boolean {
  const blockers = cellPieces(layout).filter((p) => p.kind === "shelf" || p.kind === "tree");
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) * 8;
  for (let i = 1; i < steps; i++) {
    const x = from.x + (to.x - from.x) * i / steps;
    const y = from.y + (to.y - from.y) * i / steps;
    const cell = { x: Math.round(x), y: Math.round(y) };
    if (sameCell(cell, from) || sameCell(cell, to)) continue;
    if (!indoor(layout, cell) || blockers.some((p) => sameCell(p, cell))) return false;
  }
  return true;
}

function rankedDirections(from: Cell, to: Cell): Side[] {
  return [...FACINGS].sort((a, b) => {
    const dot = (direction: Side) => (to.x - from.x) * VECTORS[direction].x + (to.y - from.y) * VECTORS[direction].y;
    return dot(b) - dot(a);
  });
}

export function automaticFacing(slug: string, layout: Layout, piece: CellPiece): Facing {
  const result = (direction: Side, reason: string): Facing => ({ direction, reason, manual: false });
  if (!isDirectional(piece)) return result("s", "This object has no directional front.");
  const alcove = alcoveAt(layout.room, layout.pieces, piece);
  if (alcove && piece.kind !== "gate") return result(OPPOSITE[alcove.side], safeFront(layout, piece, OPPOSITE[alcove.side], false)
    ? "Faces the alcove opening, back into the room." : "Faces the alcove opening; furniture currently blocks the space in front.");
  const windowPlace = slug === "window-place" && piece.kind === "seat";
  const safe = FACINGS.filter((side) => safeFront(layout, piece, side, windowPlace));
  const inward = FACINGS.filter((side) => piece.kind === "gate" ? inWorld(layout.world, nextCell(piece, side)) && !indoor(layout, nextCell(piece, side)) : indoor(layout, nextCell(piece, side)));
  const candidates = safe.length ? safe : inward.length ? inward : [...FACINGS];
  const center = { x: layout.room.x + (layout.room.w - 1) / 2, y: layout.room.y + (layout.room.h - 1) / 2 };
  const fallback = rankedDirections(piece, center).find((side) => candidates.includes(side))!;
  const cells = cellPieces(layout);
  const nearby = (kind: string, radius: number) => cells.filter((other) => other.kind === kind && !sameCell(other, piece) && chebyshev(other, piece) <= radius)
    .sort((a, b) => manhattan(a, piece) - manhattan(b, piece) || a.y - b.y || a.x - b.x);
  const toward = (target: Cell): Side | undefined => rankedDirections(piece, target).find((side) => candidates.includes(side) &&
    (target.x - piece.x) * VECTORS[side].x + (target.y - piece.y) * VECTORS[side].y > 0);
  if (piece.kind === "gate") {
    const paths = nearby("path", 1).filter((p) => manhattan(p, piece) === 1);
    const door = wallPieces(layout).filter((wall) => wall.kind === "door").map((wall) => exteriorCell(layout.room, wall))
      .sort((a, b) => manhattan(a, piece) - manhattan(b, piece) || a.y - b.y || a.x - b.x)[0];
    const route = door ? connectedPath(cells.filter((p) => p.kind === "path"), piece, door) : null;
    if (route && route.length > 1) {
      const direction = toward(route[1]);
      if (direction) return result(direction, "Passage follows the connected path toward the door.");
    }
    const count = (side: Side) => paths.filter((p) => sameCell(p, nextCell(piece, side)) || sameCell(p, nextCell(piece, OPPOSITE[side]))).length;
    const directions = rankedDirections(piece, door ?? center).filter((side) => candidates.includes(side));
    directions.sort((a, b) => count(b) - count(a));
    return result(directions[0] ?? fallback, paths.length ? "Passage lines up with the neighboring path stones." : "Passage points toward the entrance.");
  }
  if (!safe.length) return result(fallback, "No clear front available; uses the inward direction rather than a solid wall.");
  if (windowPlace) {
    const side = candidates.find((side) => glazing(layout, piece, side));
    if (side) return result(side, "Faces the glass in this window place.");
  }
  if (piece.kind === "shelf") {
    const backed = candidates.filter((side) => !indoor(layout, nextCell(piece, OPPOSITE[side])) && !wallPieces(layout).some((wall) =>
      wall.side === OPPOSITE[side] && sameCell(interiorCell(layout.room, wall), piece)));
    if (backed.length) return result(rankedDirections(piece, center).find((side) => backed.includes(side))!, "Solid back against the wall; shelves open into the room.");
    for (const seat of nearby("seat", 2)) {
      const direction = toward(seat);
      if (direction && clearView(layout, piece, seat)) return result(direction, "Shelves open toward nearby seating.");
    }
    return result(fallback, safe.length ? "Shelves open toward the room's clear space." : "No clear front available; uses the inward direction.");
  }
  const focuses = slug === "sitting-circle"
    ? [...nearby("hearth", 2), ...nearby("table", 2)]
    : [...nearby("table", 2), ...nearby("hearth", 2)];
  for (const focus of focuses) {
    const direction = toward(focus);
    if (direction && clearView(layout, piece, focus)) return result(direction, `Faces the nearby ${focus.kind}.`);
  }
  for (const seat of nearby("seat", 2)) {
    const direction = toward(seat);
    if (direction && clearView(layout, piece, seat)) return result(direction, "Faces nearby seating for conversation.");
  }
  return result(fallback, safe.length ? "Faces inward with a clear space in front." : "No clear front available; uses the inward direction.");
}

export function resolveFacing(slug: string, layout: Layout, piece: CellPiece): Facing {
  if (isDirectional(piece) && isFacing(piece.facing)) return { direction: piece.facing, reason: "Your chosen direction stays fixed until you select Auto.", manual: true };
  return automaticFacing(slug, layout, piece);
}
