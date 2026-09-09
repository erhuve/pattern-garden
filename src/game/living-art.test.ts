import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LampGlyph, LivingPieceIcon, TrellisGlyph } from "./LivingGlyph";

const postNames = (markup: string) => [...markup.matchAll(/data-trellis-post="([^"]+)"/g)].map(match => match[1]);
const shapeTags = (markup: string) => markup.match(/<(?:polygon|polyline|ellipse|path)\b[^>]*>/g) ?? [];

function contains(x: number, y: number, polygon: number[][]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[j];
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

describe("living attachment artwork", () => {
  test("lamp draws relative to cell center at table height with a compact warm pool", () => {
    const markup = renderToStaticMarkup(createElement(LampGlyph));
    expect(markup.startsWith("<g ")).toBe(true);
    expect(markup).toContain('data-living-kind="lamp"');
    expect(markup).not.toContain("transform=");
    expect(markup).toContain('class="pg-lamp-cord" d="M0-60V-52"');
    expect(markup).toContain('data-light-height="16"');
    expect(markup).toContain('cx="0" cy="-16" rx="15" ry="6"');
    expect(markup).toContain('class="pg-lamp-shade-top" cx="0" cy="-52"');
    expect(markup).toContain('pointer-events="none"');
    expect(markup).toContain('aria-hidden="true"');
  });

  test("trellis has exactly four distinct corner posts and one overhead roof", () => {
    const markup = renderToStaticMarkup(createElement(TrellisGlyph));
    expect(postNames(markup)).toEqual(["rear", "left", "right", "front"]);
    expect([...markup.matchAll(/data-trellis-roof="true"/g)]).toHaveLength(1);
    expect(markup).not.toContain("pg-trellis-vine");
    expect(markup).toContain('data-planted="false"');
    const faces = [...markup.matchAll(/<polygon class="pg-trellis-post" points="([^"]+)"/g)].map(match => match[1]);
    expect(new Set(faces).size).toBe(4);
    expect(markup).toContain('data-roof-height="40"');
    expect(markup).toContain('class="pg-trellis-beam-back" points="-24,-40 0,-52 24,-40"');
    expect(markup).toContain('class="pg-trellis-beam-front" points="-24,-40 0,-28 24,-40"');
  });

  test("split back and front reproduce all geometry once, in painter order", () => {
    for (const planted of [false, true]) {
      const back = renderToStaticMarkup(createElement(TrellisGlyph, { layer: "back", planted }));
      const front = renderToStaticMarkup(createElement(TrellisGlyph, { layer: "front", planted }));
      const all = renderToStaticMarkup(createElement(TrellisGlyph, { layer: "all", planted }));
      expect(postNames(back)).toEqual(["rear", "left", "right"]);
      expect(postNames(front)).toEqual(["front"]);
      expect(back).not.toContain("data-trellis-roof");
      expect(front).toContain("data-trellis-roof");
      expect(shapeTags(back + front)).toEqual(shapeTags(all));
      expect(front.indexOf('data-trellis-post="front"')).toBeLessThan(front.indexOf("data-trellis-roof"));
    }
  });

  test("planted canopy grows at each post and overhead, without replacing its structure", () => {
    const bare = renderToStaticMarkup(createElement(TrellisGlyph));
    const planted = renderToStaticMarkup(createElement(TrellisGlyph, { planted: true }));
    expect(postNames(planted)).toEqual(postNames(bare));
    expect([...planted.matchAll(/class="pg-trellis-vine"/g)]).toHaveLength(4);
    expect(planted).toContain('class="pg-trellis-roof-foliage"');
    expect(planted).toContain('data-planted="true"');
    expect(planted).not.toContain("<rect");
  });

  test("open frame leaves the walk visible beside the narrow foreground corner post", () => {
    const markup = renderToStaticMarkup(createElement(TrellisGlyph));
    const polygons = [...markup.matchAll(/<polygon\b[^>]*points="([^"]+)"/g)].map(match => match[1].split(" ").map(point => point.split(",").map(Number)));
    for (const x of [-8, 8]) for (const y of [0, -5, -15, -25, -32]) {
      expect(polygons.some(polygon => contains(x, y, polygon))).toBe(false);
    }
    for (const polygon of polygons) for (const [x, y] of polygon) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(Math.abs(x)).toBeLessThanOrEqual(26);
      expect(y).toBeGreaterThanOrEqual(-64);
      expect(y).toBeLessThanOrEqual(13);
    }
  });

  test("palette icons reuse board props and have sufficient surrounding space", () => {
    for (const kind of ["lamp", "trellis"] as const) {
      const icon = renderToStaticMarkup(createElement(LivingPieceIcon, { kind }));
      const glyph = kind === "lamp" ? renderToStaticMarkup(createElement(LampGlyph)) : renderToStaticMarkup(createElement(TrellisGlyph, { planted: true }));
      expect(icon.startsWith("<svg ")).toBe(true);
      expect(icon).toContain('class="pg-piece-icon pg-living-piece-icon"');
      expect(icon).toContain('focusable="false"');
      expect(icon).toContain('pointer-events="none"');
      expect(icon).toContain(glyph);
      expect(icon).not.toMatch(/\sid="|<filter|<animate|<foreignObject|tabindex=/);
      const frame = icon.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
      expect(frame[0]).toBeLessThanOrEqual(-30);
      expect(frame[1]).toBeLessThanOrEqual(-66);
      expect(frame[1] + frame[3]).toBeGreaterThanOrEqual(13);
    }
  });

  test("bundled CSS disables descendant picking and keeps overhead lattice translucent", async () => {
    const source = await Bun.file(new URL("./LivingGlyph.tsx", import.meta.url)).text();
    const css = await Bun.file(new URL("./living-art.css", import.meta.url)).text();
    expect(source).toContain('import "./living-art.css"');
    expect(source).not.toMatch(/from ["']\.\/(?:Board|types)["']/);
    const picking = css.match(/([^{}]+)\{[^{}]*pointer-events: none;[^{}]*\}/)![1];
    expect(picking).toContain(".pg-living-glyph *");
    expect(picking).toContain(".pg-living-piece-icon *");
    expect(css).toMatch(/\.pg-trellis-lattice\s*\{\s*opacity: 0\.42;/);
    expect(css).not.toMatch(/animation:|filter:|url\(/);
  });
});
