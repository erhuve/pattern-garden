import type { Cell, Layout } from "./types";
import { cellPieces, inWorld, indoorCell, interiorCell, neighbors4, sameCell, wallPieces } from "./geometry";

const key = (c: Cell) => `${c.x},${c.y}`;

export function routeBetween(layout: Layout, from: Cell, to: Cell): Cell[] | null {
  const start = { x: Math.round(from.x), y: Math.round(from.y) };
  const pieces = cellPieces(layout);
  const clear = (c: Cell) => {
    if (!inWorld(layout.world, c)) return false;
    const p = pieces.find((p) => sameCell(p, c));
    return !p || p.kind === "path" || p.kind === "gate" || sameCell(c, to) && (p.kind === "seat" || p.kind === "bench");
  };
  if (!clear(to)) return null;
  const seen = new Map<string, Cell | null>([[key(start), null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (sameCell(c, to)) {
      const route: Cell[] = [];
      let at: Cell | null = c;
      while (at) { route.unshift(at); at = seen.get(key(at)) ?? null; }
      return route;
    }
    for (const n of neighbors4(c)) {
      if (seen.has(key(n)) || !clear(n)) continue;
      if (indoorCell(layout, c) !== indoorCell(layout, n)) {
        const inside = indoorCell(layout, c) ? c : n;
        const outside = inside === c ? n : c;
        const side = outside.y < inside.y ? "n" : outside.y > inside.y ? "s" : outside.x < inside.x ? "w" : "e";
        if (!wallPieces(layout).some((w) => w.kind === "door" && w.side === side && sameCell(interiorCell(layout.room, w), inside))) continue;
      }
      seen.set(key(n), c);
      queue.push(n);
    }
  }
  return null;
}

export function freeWalkingCells(layout: Layout): Cell[] {
  const occupied = new Set(cellPieces(layout).filter((p) => p.kind !== "path" && p.kind !== "gate").map(key));
  const cells: Cell[] = [];
  for (let y = 0; y < layout.world.h; y++) for (let x = 0; x < layout.world.w; x++) {
    const c = { x, y };
    if (!occupied.has(key(c)) && (layout.outdoorFurniture ? !indoorCell(layout, c) : indoorCell(layout, c))) cells.push(c);
  }
  return cells;
}
