import type { Cell, CheckResult, Layout, Rect, Side } from "./types";
import { cellPieces, inRoom, inWorld, neighbors4 } from "./geometry";

export const SIDES: Side[] = ["n", "e", "s", "w"];
export const OPPOSITE: Record<Side, Side> = { n: "s", e: "w", s: "n", w: "e" };
const VECTORS: Record<Side, Cell> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };
export const cellKey = (cell: Cell): string => `${cell.x},${cell.y}`;
export const step = (cell: Cell, side: Side, distance = 1): Cell => ({ x: cell.x + VECTORS[side].x * distance, y: cell.y + VECTORS[side].y * distance });
export const byPosition = (a: Cell, b: Cell): number => a.y - b.y || a.x - b.x;

export function cellsIn(rect: Rect): Cell[] {
  return Array.from({ length: rect.w * rect.h }, (_, i) => ({ x: rect.x + i % rect.w, y: rect.y + Math.floor(i / rect.w) }));
}

export function rule(id: string, label: string, points: number, value: boolean | number, detail: string): CheckResult {
  const ratio = typeof value === "boolean" ? Number(value) : Math.max(0, Math.min(1, value));
  return { id, label, points, ratio, earned: Math.round(points * ratio), detail };
}

export function freeFloor(layout: Layout, domain: "inside" | "outside" | "plot"): Cell[] {
  const blocked = new Set(cellPieces(layout).filter((p) => p.kind !== "path" && p.kind !== "gate").map(cellKey));
  return cellsIn({ x: 0, y: 0, ...layout.world }).filter((cell) => {
    const inside = layout.setting !== "garden" && inRoom(layout.room, cell);
    return !blocked.has(cellKey(cell)) && (domain === "plot" || (domain === "inside" ? inside : !inside));
  });
}

export function reachable(cells: Cell[], starts: Cell[]): Set<string> {
  const allowed = new Set(cells.map(cellKey));
  const seen = new Set<string>();
  const queue: Cell[] = [];
  for (const cell of starts) {
    const key = cellKey(cell);
    if (allowed.has(key) && !seen.has(key)) { seen.add(key); queue.push(cell); }
  }
  for (let i = 0; i < queue.length; i++) {
    for (const cell of neighbors4(queue[i])) {
      const key = cellKey(cell);
      if (allowed.has(key) && !seen.has(key)) { seen.add(key); queue.push(cell); }
    }
  }
  return seen;
}

export function onEdge(layout: Layout, cell: Cell, side?: Side): boolean {
  if (!inWorld(layout.world, cell)) return false;
  const edges: Record<Side, boolean> = { n: cell.y === 0, s: cell.y === layout.world.h - 1, w: cell.x === 0, e: cell.x === layout.world.w - 1 };
  return side ? edges[side] : SIDES.some((candidate) => edges[candidate]);
}

export function sideOf(center: Cell, cell: Cell): Side {
  const dx = cell.x - center.x;
  const dy = cell.y - center.y;
  return Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? "e" : "w" : dy >= 0 ? "s" : "n";
}

export function bestCandidate<T extends { checks: CheckResult[] }>(candidates: T[]): T {
  return candidates.reduce((best, candidate) => {
    const full = (value: T) => value.checks.every((check) => check.ratio === 1);
    const value = (item: T) => item.checks.reduce((sum, check) => sum + check.points * check.ratio, 0);
    if (full(candidate) !== full(best)) return full(candidate) ? candidate : best;
    return value(candidate) > value(best) ? candidate : best;
  });
}
