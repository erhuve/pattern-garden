import type { Cell, CellPiece, Layout, Level, Piece, PieceKind, Rect, Side, WallPiece, WallPieceKind } from "./types";
import { isCellPiece, isWallPiece } from "./types";

export function wallLength(room: Rect, side: Side): number {
  return side === "n" || side === "s" ? room.w : room.h;
}

export function interiorCell(room: Rect, wall: { side: Side; pos: number }): Cell {
  switch (wall.side) {
    case "n":
      return { x: room.x + wall.pos, y: room.y };
    case "s":
      return { x: room.x + wall.pos, y: room.y + room.h - 1 };
    case "w":
      return { x: room.x, y: room.y + wall.pos };
    case "e":
      return { x: room.x + room.w - 1, y: room.y + wall.pos };
  }
}

export function exteriorCell(room: Rect, wall: { side: Side; pos: number }): Cell {
  const c = interiorCell(room, wall);
  switch (wall.side) {
    case "n":
      return { x: c.x, y: c.y - 1 };
    case "s":
      return { x: c.x, y: c.y + 1 };
    case "w":
      return { x: c.x - 1, y: c.y };
    case "e":
      return { x: c.x + 1, y: c.y };
  }
}

export function inRoom(room: Rect, c: Cell): boolean {
  return c.x >= room.x && c.x < room.x + room.w && c.y >= room.y && c.y < room.y + room.h;
}

export function inWorld(world: { w: number; h: number }, c: Cell): boolean {
  return c.x >= 0 && c.x < world.w && c.y >= 0 && c.y < world.h;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.x === b.x && a.y === b.y;
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function chebyshev(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function wallPieces(layout: Layout): WallPiece[] {
  return layout.pieces.filter(isWallPiece);
}

export function cellPieces(layout: Layout): CellPiece[] {
  return layout.pieces.filter(isCellPiece);
}

export function pieceAt(layout: Layout, c: Cell): CellPiece | undefined {
  return cellPieces(layout).find((p) => p.x === c.x && p.y === c.y);
}

export function wallAt(layout: Layout, side: Side, pos: number): WallPiece | undefined {
  return wallPieces(layout).find((p) => p.side === side && p.pos === pos);
}

export function samePiece(a: Piece, b: Piece): boolean {
  if (isWallPiece(a) && isWallPiece(b)) return a.side === b.side && a.pos === b.pos;
  if (isCellPiece(a) && isCellPiece(b)) return a.x === b.x && a.y === b.y;
  return false;
}

export function distinctSides(pieces: WallPiece[]): Side[] {
  return Array.from(new Set(pieces.map((p) => p.side)));
}

const DIRS: Cell[] = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
];

export function neighbors4(c: Cell): Cell[] {
  return DIRS.map((d) => ({ x: c.x + d.x, y: c.y + d.y }));
}

export function connectedPath(cells: Cell[], from: Cell, to: Cell): Cell[] | null {
  const key = (c: Cell) => `${c.x},${c.y}`;
  const set = new Set(cells.map(key));
  set.add(key(from));
  set.add(key(to));
  const prev = new Map<string, string | null>();
  const queue: Cell[] = [from];
  prev.set(key(from), null);
  while (queue.length) {
    const cur = queue.shift()!;
    if (sameCell(cur, to)) {
      const out: Cell[] = [];
      let k: string | null = key(cur);
      while (k) {
        const [x, y] = k.split(",").map(Number);
        out.unshift({ x, y });
        k = prev.get(k) ?? null;
      }
      return out;
    }
    for (const n of neighbors4(cur)) {
      const nk = key(n);
      if (set.has(nk) && !prev.has(nk)) {
        prev.set(nk, key(cur));
        queue.push(n);
      }
    }
  }
  return null;
}

export function pathTurns(path: Cell[]): number {
  let turns = 0;
  for (let i = 2; i < path.length; i++) {
    const a = { x: path[i - 1].x - path[i - 2].x, y: path[i - 1].y - path[i - 2].y };
    const b = { x: path[i].x - path[i - 1].x, y: path[i].y - path[i - 1].y };
    if (a.x !== b.x || a.y !== b.y) turns++;
  }
  return turns;
}

export type PlaceTarget = { type: "cell"; x: number; y: number } | { type: "wall"; side: Side; pos: number };

const OUTDOOR_KINDS = new Set<PieceKind>(["tree", "path", "gate"]);
const INDOOR_KINDS = new Set<PieceKind>(["seat", "table", "shelf", "hearth"]);

export function placeAt(level: Level, pieces: Piece[], kind: PieceKind, t: PlaceTarget): Piece[] | string {
  if (t.type === "wall") {
    if (!isWallKind(kind)) return "That piece belongs on the floor.";
    if (t.pos < 0 || t.pos >= wallLength(level.room, t.side)) return "That is not part of the room's wall.";
    const existing = pieces.find((p) => isWallPiece(p) && p.side === t.side && p.pos === t.pos);
    if (existing) return `There is already a ${existing.kind} there. Remove it first.`;
    return [...pieces, { kind, side: t.side, pos: t.pos }];
  }
  if (isWallKind(kind)) return "That piece belongs on a wall.";
  const c = { x: t.x, y: t.y };
  if (!inWorld(level.world, c)) return "Off the edge of the world.";
  const inside = inRoom(level.room, c);
  if (OUTDOOR_KINDS.has(kind) && inside) return `A ${kind} belongs outside the room.`;
  if (INDOOR_KINDS.has(kind) && !inside) return `A ${kind} belongs inside the room.`;
  const existing = pieces.find((p) => isCellPiece(p) && p.x === c.x && p.y === c.y);
  if (existing) return `There is already a ${existing.kind} there. Remove it first.`;
  return [...pieces, { kind, x: c.x, y: c.y } as CellPiece];
}

export function removeAt(pieces: Piece[], t: PlaceTarget): Piece[] {
  if (t.type === "wall") return pieces.filter((p) => !(isWallPiece(p) && p.side === t.side && p.pos === t.pos));
  return pieces.filter((p) => !(isCellPiece(p) && p.x === t.x && p.y === t.y));
}

function isWallKind(kind: PieceKind): kind is WallPieceKind {
  return kind === "window" || kind === "door" || kind === "alcove";
}
