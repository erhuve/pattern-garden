import type { Cell, Layout, Level } from "./types";

type SceneLayout = Pick<Layout, "scene" | "world"> | Pick<Level, "scene" | "world">;

export function sceneEndpoints(layout: SceneLayout): Cell[] {
  return layout.scene === "trellised-walk" ? [{ x: 0, y: Math.floor(layout.world.h / 2) }, { x: layout.world.w - 1, y: Math.floor(layout.world.h / 2) }] : [];
}

export function sceneReserved(layout: SceneLayout, cell: Cell): boolean {
  if (layout.scene === "overlooking-life" || layout.scene === "garden-seat") return cell.y === layout.world.h - 1;
  return sceneEndpoints(layout).some((end) => end.x === cell.x && end.y === cell.y);
}

export function gardenSunny(layout: Layout, cell: Cell): boolean {
  return !layout.pieces.some((p) => {
    if (!("x" in p)) return false;
    const south = p.y - cell.y;
    return p.kind === "hedge" && south === 1 && p.x === cell.x || p.kind === "tree" && south >= 1 && south <= 3 && Math.abs(p.x - cell.x) <= 1;
  });
}
