import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DirectionalGlyph, orderedModel, rotateXY } from "./DirectionalGlyph";
import { NewPieceGlyph } from "./NewPieceGlyph";
import type { Side } from "./types";

type Point = [number, number];
const sides: Side[] = ["n", "e", "s", "w"];
const polygons = (svg: string): Point[][] => [...svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"/g)].map(match => match[1].split(" ").map(point => point.split(",").map(Number) as Point));

function contains(x: number, y: number, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

describe("expanded furniture artwork", () => {
  test("bench has a shallow single-cell footprint, open legs, wooden seat slats and a back", () => {
    for (const facing of sides) {
      const boxes = orderedModel("bench", facing);
      expect(boxes).toHaveLength(9);
      expect(Math.min(...boxes.map(b => b.x))).toBe(-0.43);
      expect(Math.max(...boxes.map(b => b.x + b.w))).toBeCloseTo(0.43);
      expect(Math.min(...boxes.map(b => b.y))).toBe(-0.25);
      expect(Math.max(...boxes.map(b => b.y + b.d))).toBeCloseTo(0.25);
      expect(boxes.filter(b => b.z === 0)).toHaveLength(4);
      expect(boxes.filter(b => b.z === 9 && b.h === 2)).toHaveLength(3);
      expect(boxes.filter(b => b.z >= 13)).toHaveLength(2);
      for (const b of boxes) {
        expect([b.x, b.y, b.w, b.d, b.z, b.h].every(Number.isFinite)).toBe(true);
        expect(b.w > 0 && b.d > 0 && b.h > 0).toBe(true);
        expect(b.material.startsWith("pg-wood")).toBe(true);
        for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y + b.d]]) {
          const p = rotateXY(x, y, facing);
          expect(Math.abs(p.x)).toBeLessThan(0.5);
          expect(Math.abs(p.y)).toBeLessThan(0.5);
        }
      }
    }
  });

  test("bench orientations reorder identical geometry without shared mutable state", () => {
    const fingerprint = (facing: Side) => orderedModel("bench", facing).map(b => JSON.stringify(b)).sort();
    for (const facing of sides) expect(fingerprint(facing)).toEqual(fingerprint("s"));
    const original = orderedModel("bench", "s");
    const before = JSON.stringify(original);
    for (const facing of sides) orderedModel("bench", facing);
    expect(JSON.stringify(original)).toBe(before);
    original[0].h = 100;
    original.reverse();
    expect(JSON.stringify(orderedModel("bench", "s"))).toBe(before);
    const views = sides.map(facing => renderToStaticMarkup(createElement(DirectionalGlyph, { kind: "bench", facing })));
    expect(new Set(views).size).toBe(4);
  });

  for (const facing of sides) {
    test(`bench ${facing} painter order matches nearest solid surfaces`, () => {
      const boxes = orderedModel("bench", facing).map(box => {
        const a = rotateXY(box.x, box.y, facing), b = rotateXY(box.x + box.w, box.y + box.d, facing);
        return { min: [Math.min(a.x, b.x), Math.min(a.y, b.y), box.z], max: [Math.max(a.x, b.x), Math.max(a.y, b.y), box.z + box.h] };
      });
      const faces = polygons(renderToStaticMarkup(createElement(DirectionalGlyph, { kind: "bench", facing })));
      expect(faces.length).toBe(boxes.length * 3);
      let samples = 0;
      const failures: string[] = [];
      for (let ix = -55; ix <= 55; ix++) for (let iy = -90; iy <= 45; iy++) {
        const x = ix / 2 + 0.071, y = iy / 2 + 0.083;
        const depths = boxes.map(box => {
          const low = Math.max(box.min[0] - x / 60, box.min[1] + x / 60, (box.min[2] + y) / 30);
          const high = Math.min(box.max[0] - x / 60, box.max[1] + x / 60, (box.max[2] + y) / 30);
          return high - low > 0.00001 ? high : -Infinity;
        });
        const nearest = Math.max(...depths);
        if (!Number.isFinite(nearest)) continue;
        samples++;
        const painted = faces.findLastIndex(face => contains(x, y, face));
        if (painted < 0 || nearest - depths[Math.floor(painted / 3)] > 0.0001) failures.push(`${x},${y}`);
      }
      expect(samples).toBeGreaterThan(2000);
      expect(failures).toEqual([]);
    });
  }

  for (const kind of ["desk", "hedge"] as const) {
    test(`${kind} uses the isometric cell center and non-directional painted-piece wrapper`, () => {
      const svg = renderToStaticMarkup(createElement(NewPieceGlyph, { kind, x: 2, y: 4 }));
      expect(svg).toContain('class="pg-piece"');
      expect(svg).toContain('data-piece-cell="2,4"');
      expect(svg).toContain(`data-kind="${kind}"`);
      expect(svg).toContain('transform="translate(-60 105)"');
      expect(svg).not.toContain("data-facing");
      expect(svg).not.toContain("<rect");
      for (const facing of sides) expect(renderToStaticMarkup(createElement(NewPieceGlyph, { kind, x: 2, y: 4, facing, manual: true }))).toBe(svg);
      const icon = renderToStaticMarkup(createElement(NewPieceGlyph, { kind, x: -0.5, y: -0.5 }));
      expect(icon).toContain('transform="translate(0 0)"');
      const vertices = [...icon.matchAll(/<(?:polygon|polyline)\b[^>]*\bpoints="([^"]+)"/g)].flatMap(match => match[1].split(" ").map(point => point.split(",").map(Number)));
      for (const [x, y] of vertices) {
        expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
        expect(Math.abs(x)).toBeLessThanOrEqual(24.01);
        expect(y).toBeGreaterThanOrEqual(-32.01);
        expect(y).toBeLessThanOrEqual(12.01);
      }
      expect(svg).toContain(kind === "desk" ? "pg-desk-notebook" : "pg-hedge-crown");
      expect(svg).toContain("pg-new-piece-detail");
    });
  }

  test("hedge leaf flecks stay on the solid enclosure rather than floating beyond its faces", () => {
    const svg = renderToStaticMarkup(createElement(NewPieceGlyph, { kind: "hedge", x: -0.5, y: -0.5 }));
    const faces = polygons(svg);
    const flecks = [...svg.matchAll(/<polyline class="pg-hedge-leaf" points="([^"]+)"/g)];
    expect(flecks).toHaveLength(10);
    for (const fleck of flecks) for (const point of fleck[1].split(" ")) {
      const [x, y] = point.split(",").map(Number);
      expect(faces.slice(0, 2).some(face => contains(x, y, face))).toBe(true);
    }
  });
});
