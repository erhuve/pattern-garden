import type { Cell, Layout, Side } from "./types";
import { cellPieces, inRoom, interiorCell, sameCell, wallPieces } from "./geometry";

const vectors: Record<Side, Cell> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
const sides = Object.keys(vectors) as Side[];
const neighbor = (cell: Cell, side: Side): Cell => ({ x: cell.x + vectors[side].x, y: cell.y + vectors[side].y });

export function windowNook(layout: Layout, seat: Cell): { enclosed: boolean; accessible: boolean } {
  const windows = wallPieces(layout).filter((w) => w.kind === "window" && sameCell(interiorCell(layout.room, w), seat));
  const furniture = cellPieces(layout);
  const occupied = (cell: Cell) => furniture.some((p) => sameCell(p, cell));
  const clear = (cell: Cell) => inRoom(layout.room, cell) && !occupied(cell);
  const enclosure = (side: Side) => {
    const cell = neighbor(seat, side);
    if (inRoom(layout.room, cell)) return furniture.some((p) => p.kind === "shelf" && sameCell(p, cell));
    return !wallPieces(layout).some((w) => w.side === side && sameCell(interiorCell(layout.room, w), seat));
  };
  const enclosed = windows.some((w) => (w.side === "n" || w.side === "s" ? ["w", "e"] as Side[] : ["n", "s"] as Side[]).some(enclosure));
  const queue = sides.map((s) => neighbor(seat, s)).filter(clear);
  const seen = new Set(queue.map((c) => `${c.x},${c.y}`));
  let accessible = false;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    const r = layout.room;
    if (c.x > r.x && c.x < r.x + r.w - 1 && c.y > r.y && c.y < r.y + r.h - 1) {
      accessible = true;
      break;
    }
    for (const side of sides) {
      const next = neighbor(c, side);
      const key = `${next.x},${next.y}`;
      if (clear(next) && !seen.has(key)) { queue.push(next); seen.add(key); }
    }
  }
  return { enclosed: windows.length > 0 && enclosed, accessible: windows.length > 0 && accessible };
}
