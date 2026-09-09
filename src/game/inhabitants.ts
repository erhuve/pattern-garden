import type { Cell, Layout } from "./types";
import { cellPieces, inRoom, sameCell } from "./geometry";
import { freeWalkingCells, routeBetween } from "./walking-routes";

export type Inhabitant = { id: number; x: number; y: number; tx: number; ty: number; mood: number; route?: Cell[] };

const BLOCKING = new Set(["table", "shelf", "hearth", "tree", "desk", "hedge"]);

export function walkable(layout: Layout, c: Cell): boolean {
  if (c.x < 0 || c.y < 0 || c.x >= layout.world.w || c.y >= layout.world.h) return false;
  const p = cellPieces(layout).find((q) => q.x === c.x && q.y === c.y);
  return !(p && BLOCKING.has(p.kind));
}

export function spawn(layout: Layout, count: number): Inhabitant[] {
  const out: Inhabitant[] = [];
  if (layout.obstacleAware) {
    const free = freeWalkingCells(layout);
    for (let i = 0; i < count && free.length; i++) {
      const c = free[Math.min(free.length - 1, Math.floor(i * free.length / count))];
      out.push({ id: i, ...c, tx: c.x, ty: c.y, mood: 0 });
    }
    return out;
  }
  const r = layout.room;
  for (let i = 0; i < count; i++) {
    const x = r.x + ((i * 2) % r.w);
    const y = r.y + (Math.floor((i * 2) / r.w) % r.h);
    out.push({ id: i, x, y, tx: x, ty: y, mood: 0 });
  }
  return out;
}

export function retarget(layout: Layout, people: Inhabitant[], attractors: Cell[], rng: () => number): Inhabitant[] {
  const taken = new Set<string>();
  if (layout.obstacleAware) {
    return people.map((p) => {
      const free = freeWalkingCells(layout);
      const origin = walkable(layout, { x: Math.round(p.x), y: Math.round(p.y) }) ? p : free[0] ?? p;
      const destinations = attractors.filter((a) => !taken.has(`${a.x},${a.y}`)).sort((a, b) => Math.hypot(a.x - origin.x, a.y - origin.y) - Math.hypot(b.x - origin.x, b.y - origin.y));
      if (!destinations.length && free.length) destinations.push(free[Math.floor(rng() * free.length)]);
      for (const target of destinations) {
        const route = routeBetween(layout, origin, target);
        if (!route) continue;
        taken.add(`${target.x},${target.y}`);
        const next = route[1] ?? target;
        return { ...p, x: Math.round(origin.x), y: Math.round(origin.y), tx: next.x, ty: next.y, route: route.slice(2), mood: attractors.some((a) => sameCell(a, target)) ? 1 : 0 };
      }
      return { ...p, x: origin.x, y: origin.y, tx: origin.x, ty: origin.y, route: [], mood: 0 };
    });
  }
  return people.map((p) => {
    const free = attractors.filter((a) => !taken.has(`${a.x},${a.y}`) && walkable(layout, a));
    let target: Cell | null = null;
    if (free.length && rng() < 0.85) {
      free.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      target = free[Math.min(free.length - 1, Math.floor(rng() * Math.min(2, free.length)))];
    } else {
      const r = layout.room;
      for (let tries = 0; tries < 8 && !target; tries++) {
        const c = { x: r.x + Math.floor(rng() * r.w), y: r.y + Math.floor(rng() * r.h) };
        if (walkable(layout, c) && inRoom(r, c)) target = c;
      }
    }
    if (!target) target = { x: p.x, y: p.y };
    taken.add(`${target.x},${target.y}`);
    const content = attractors.some((a) => sameCell(a, target!));
    return { ...p, tx: target.x, ty: target.y, mood: content ? 1 : 0 };
  });
}

export function step(people: Inhabitant[], dt: number): Inhabitant[] {
  return people.map((p) => {
    const dx = p.tx - p.x;
    const dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.01) {
      const [next, ...remaining] = p.route ?? [];
      return next ? { ...p, x: p.tx, y: p.ty, tx: next.x, ty: next.y, route: remaining } : { ...p, x: p.tx, y: p.ty };
    }
    const s = Math.min(d, dt * 1.6);
    return { ...p, x: p.x + (dx / d) * s, y: p.y + (dy / d) * s };
  });
}
