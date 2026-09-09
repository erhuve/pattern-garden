import type { Cell, CellPiece, Layout, Level, Piece, PieceKind, Rect, Side, WallPiece, WallPieceKind } from "./types";
import { isCellPiece, isWallPiece } from "./types";
import { sceneReserved } from "./scene-terrain";

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

export function alcoveCell(room: Rect, wall: { side: Side; pos: number }): Cell {
  return exteriorCell(room, wall);
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

export function alcoveAt(room: Rect, pieces: Piece[], c: Cell): WallPiece | undefined {
  return pieces.find(
    (piece): piece is WallPiece =>
      isWallPiece(piece) && piece.kind === "alcove" && sameCell(alcoveCell(room, piece), c),
  );
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

export type PlaceTarget = { type: "cell"; x: number; y: number } | { type: "wall"; side: Side; pos: number } | { type: "sill"; side: Side; pos: number };

export function usedInventory(pieces: Piece[], kind: PieceKind): number {
  if (kind === "lamp") return pieces.filter((p) => p.kind === "table" && p.lamp === true).length;
  if (kind === "trellis") return pieces.filter((p) => p.kind === "path" && p.trellis === true).length;
  return pieces.filter((p) => p.kind === kind).length + (kind === "plant" ? pieces.filter((p) => p.kind === "window" && p.sillPlant === true || p.kind === "path" && p.trellis === true && p.climbingPlant === true).length : 0);
}

const OUTDOOR_KINDS = new Set<PieceKind>(["tree", "path", "gate", "bench", "hedge"]);
const INDOOR_KINDS = new Set<PieceKind>(["seat", "table", "shelf", "hearth", "desk"]);

export function indoorCell(layout: Pick<Layout, "room" | "setting" | "pieces">, c: Cell): boolean {
  return layout.setting !== "garden" && (inRoom(layout.room, c) || Boolean(alcoveAt(layout.room, layout.pieces, c)));
}

export function placeAt(level: Level, pieces: Piece[], kind: PieceKind, t: PlaceTarget): Piece[] | string {
  const limit = level.palette.find((entry) => entry.kind === kind)?.max ?? 0;
  if (limit <= 0) return "That piece is not available in this level.";
  if (usedInventory(pieces, kind) >= limit) return `All your ${kind === "plant" ? "plants" : "pieces of this kind"} are already placed.`;
  if (kind === "plant" && t.type !== "cell") {
    const window = pieces.find((p) => p.kind === "window" && p.side === t.side && p.pos === t.pos);
    if (!window || window.kind !== "window") return "Put a plant on a floor tile or an existing window sill.";
    if (window.sillPlant) return "There is already a plant on this sill.";
    return pieces.map((p) => p === window ? { ...window, sillPlant: true } : p);
  }
  if (t.type === "sill") return "Only a plant goes on a window sill.";
  if (t.type === "wall") {
    if (level.setting === "garden") return "This garden has no building walls.";
    if (!isWallKind(kind)) return "That piece belongs on the floor.";
    if (t.pos < 0 || t.pos >= wallLength(level.room, t.side)) return "That is not part of the room's wall.";
    const existing = pieces.find((p) => isWallPiece(p) && p.side === t.side && p.pos === t.pos);
    if (existing) return `There is already a ${existing.kind} there. Remove it first.`;
    return [...pieces, { kind, side: t.side, pos: t.pos }];
  }
  if (isWallKind(kind)) return "That piece belongs on a wall.";
  const c = { x: t.x, y: t.y };
  if (!inWorld(level.world, c)) return "Off the edge of the world.";
  if (sceneReserved(level, c)) return "This is an existing public walk. Connect your path beside it; do not place pieces on it.";
  const host = pieces.find((p) => isCellPiece(p) && sameCell(p, c));
  if (kind === "lamp" || kind === "trellis") {
    const expected = kind === "lamp" ? "table" : "path";
    if (!host || !isCellPiece(host) || host.kind !== expected) return kind === "lamp" ? "Place the light directly over a table." : "Place the trellis over a path stone; the path stays walkable underneath.";
    if (host[kind]) return `There is already a ${kind} here.`;
    return pieces.map((p) => p === host ? { ...host, [kind]: true } : p);
  }
  if (kind === "plant" && host?.kind === "path" && host.trellis) {
    if (host.climbingPlant) return "This trellis already has a climbing plant.";
    return pieces.map((p) => p === host ? { ...host, climbingPlant: true } : p);
  }
  const inside = indoorCell({ ...level, pieces }, c);
  if (OUTDOOR_KINDS.has(kind) && inside) return `A ${kind} belongs outside the room.`;
  if (INDOOR_KINDS.has(kind) && !inside && !(level.outdoorFurniture && (kind === "seat" || kind === "table"))) return `A ${kind} belongs inside the room.`;
  const existing = pieces.find((p) => isCellPiece(p) && p.x === c.x && p.y === c.y);
  if (existing) return `There is already a ${existing.kind} there. Remove it first.`;
  return [...pieces, { kind, x: c.x, y: c.y } as CellPiece];
}

export function isFixedTarget(level: Level, t: PlaceTarget): boolean {
  return level.scene === "eating-atmosphere" && t.type === "wall" && t.side === "n" && t.pos === 3;
}

export function removeAt(level: Level, pieces: Piece[], t: PlaceTarget): Piece[] {
  if (isFixedTarget(level, t)) return pieces;
  if (t.type === "sill") {
    return pieces.map((p) => {
      if (p.kind !== "window" || p.side !== t.side || p.pos !== t.pos) return p;
      const { sillPlant: _plant, ...window } = p;
      return window;
    });
  }
  if (t.type === "wall") {
    const wall = pieces.find((piece) => isWallPiece(piece) && piece.side === t.side && piece.pos === t.pos);
    const attachedCell = wall?.kind === "alcove" ? alcoveCell(level.room, wall) : null;
    return pieces.filter(
      (piece) =>
        !(isWallPiece(piece) && piece.side === t.side && piece.pos === t.pos) &&
        !(attachedCell && isCellPiece(piece) && sameCell(piece, attachedCell)),
    );
  }
  return pieces.filter((p) => !(isCellPiece(p) && p.x === t.x && p.y === t.y));
}

export function migrateLegacyAlcoveSeats(level: Level, pieces: Piece[]): Piece[] {
  const migrated = [...pieces];
  const alcoves = migrated.filter(
    (piece): piece is WallPiece => isWallPiece(piece) && piece.kind === "alcove",
  );
  for (const alcove of alcoves) {
    const destination = alcoveCell(level.room, alcove);
    if (migrated.some((piece) => isCellPiece(piece) && sameCell(piece, destination))) continue;
    const source = interiorCell(level.room, alcove);
    const seatIndex = migrated.findIndex(
      (piece) => isCellPiece(piece) && piece.kind === "seat" && sameCell(piece, source),
    );
    if (seatIndex >= 0) migrated[seatIndex] = { kind: "seat", ...destination };
  }
  return migrated;
}

function isWallKind(kind: PieceKind): kind is WallPieceKind {
  return kind === "window" || kind === "door" || kind === "alcove";
}
