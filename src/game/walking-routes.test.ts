import { describe, expect, test } from "bun:test";
import { EXPANDED_LEVELS } from "./expanded-levels";
import { EXPANDED_SOLUTIONS } from "./expanded-solutions";
import { routeBetween, freeWalkingCells } from "./walking-routes";
import { retarget, spawn, step } from "./inhabitants";
import { resolveFacing, setFacing } from "./orientation";
import { evaluate } from "./levels";
import { cellPieces, manhattan, sameCell } from "./geometry";
import type { Layout, Piece, CellPiece } from "./types";

const layoutFor = (slug: string): Layout => ({ ...EXPANDED_LEVELS.find(l => l.slug === slug)!, pieces: structuredClone(EXPANDED_SOLUTIONS[slug]) });

describe("new places and movement", () => {
  test("outdoor inhabitants can reach usable benches without crossing hedges or trees", () => {
    for (const slug of ["front-door-bench", "tree-places", "outdoor-room", "workspace-enclosure"]) {
      const level = EXPANDED_LEVELS.find(l => l.slug === slug)!;
      const layout = layoutFor(slug);
      const before = JSON.stringify(layout);
      const people = spawn(layout, level.inhabitants);
      const targets = evaluate(level, layout).attractors;
      expect(people.length).toBeGreaterThan(0);
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        const routes = people.map(p => routeBetween(layout, p, target)).filter(r => r !== null);
        expect(routes.length).toBeGreaterThan(0);
        for (const route of routes) {
          expect(sameCell(route.at(-1)!, target)).toBe(true);
          for (let i = 1; i < route.length; i++) expect(manhattan(route[i], route[i - 1])).toBe(1);
          for (const cell of route.slice(1, -1)) expect(cellPieces(layout).filter(p => p.kind !== "path" && p.kind !== "gate").some(p => sameCell(cell, p))).toBe(false);
        }
      }
      let moving = retarget(layout, people.slice(0, 1), targets.slice(0, 1), () => 0);
      for (let i = 0; i < 2000; i++) moving = step(moving, 0.05);
      expect(manhattan(moving[0], targets[0])).toBeLessThan(0.02);
      expect(JSON.stringify(layout)).toBe(before);
    }
  });

  test("workspace uses obstacle-aware movement before a desk is placed or after removal", () => {
    const layout = layoutFor("workspace-enclosure");
    layout.pieces = [{ kind: "shelf", x: 3, y: 2 }];
    const person = { id: 0, x: 2, y: 2, tx: 2, ty: 2, mood: 0 };
    let moving = retarget(layout, [person], [{ x: 4, y: 2 }], () => 0);
    expect(moving[0].route).toBeDefined();
    for (let i = 0; i < 150; i++) {
      moving = step(moving, 0.05);
      expect(Math.hypot(moving[0].x - 3, moving[0].y - 2)).toBeGreaterThan(0.45);
    }
    expect(manhattan(moving[0], { x: 4, y: 2 })).toBeLessThan(0.02);
  });

  test("replanning replaces a route invalidated by a newly placed trunk", () => {
    const layout = layoutFor("tree-places");
    layout.pieces = [];
    const person = { id: 0, x: 0, y: 0, tx: 0, ty: 0, mood: 0 };
    const original = retarget(layout, [person], [{ x: 8, y: 0 }], () => 0);
    expect(original[0].tx).toBe(1);
    layout.pieces = [{ kind: "tree", x: 1, y: 0 }];
    let updated = retarget(layout, original, [{ x: 8, y: 0 }], () => 0);
    expect(updated[0].ty).toBe(1);
    for (let i = 0; i < 300; i++) {
      updated = step(updated, 0.05);
      expect(Math.hypot(updated[0].x - 1, updated[0].y)).toBeGreaterThan(0.45);
    }
  });

  test("a sealed hedge boundary cannot be walked through", () => {
    const layout = layoutFor("outdoor-room");
    layout.pieces.push(...[3, 4, 5].map((x): Piece => ({ kind: "hedge", x, y: 6 })));
    expect(routeBetween(layout, { x: 4, y: 8 }, { x: 3, y: 3 })).toBeNull();
    expect(freeWalkingCells(layout).some(c => sameCell(c, { x: 4, y: 6 }))).toBe(false);
  });

  test("a wall can only be crossed through an actual clear doorway", () => {
    const layout = layoutFor("front-door-bench");
    const from = { x: 4, y: 3 }, to = { x: 4, y: 5 };
    expect(routeBetween(layout, from, to)).not.toBeNull();
    layout.pieces = layout.pieces.filter(p => p.kind !== "door");
    expect(routeBetween(layout, from, to)).toBeNull();
  });

  test("bench auto faces the street and desk chair faces its work; only bench facing affects score", () => {
    for (const [slug, kind, direction] of [["front-door-bench", "bench", "s"], ["workspace-enclosure", "seat", "s"]] as const) {
      const layout = layoutFor(slug);
      const piece = cellPieces(layout).find(p => p.kind === kind)!;
      expect(resolveFacing(slug, layout, piece).direction).toBe(direction);
      const manual = setFacing(layout.pieces, piece, "w");
      const fixed = manual.find(p => p.kind === kind) as CellPiece;
      expect(resolveFacing(slug, { ...layout, pieces: manual }, fixed).direction).toBe("w");
      const level = EXPANDED_LEVELS.find(l => l.slug === slug)!;
      expect(evaluate(level, { ...layout, pieces: manual }).score).toBe(slug === "front-door-bench" ? 80 : 100);
    }
  });
});
