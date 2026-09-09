import type { Cell, Layout, Side, WallPiece } from "./types";
import { cellPieces, inRoom, interiorCell, sameCell } from "./geometry";
import { byPosition, freeFloor, OPPOSITE, SIDES, step } from "./place-rules";
import { sceneReserved } from "./scene-terrain";

export const sightBlockers = (layout: Layout) => cellPieces(layout).filter((piece) => piece.kind === "hedge" || piece.kind === "tree" || piece.kind === "shelf").sort(byPosition);

export function supercover(from: Cell, to: Cell): Cell[] {
  const cells: Cell[] = [{ x: from.x, y: from.y }];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  let x = from.x;
  let y = from.y;
  let ix = 0;
  let iy = 0;
  while (ix < nx || iy < ny) {
    const decision = (1 + 2 * ix) * ny - (1 + 2 * iy) * nx;
    if (decision === 0) {
      cells.push({ x: x + sx, y }, { x, y: y + sy });
      x += sx;
      y += sy;
      ix++;
      iy++;
    } else if (decision < 0) {
      x += sx;
      ix++;
    } else {
      y += sy;
      iy++;
    }
    cells.push({ x, y });
  }
  return cells;
}

export function gardenShelter(layout: Layout, seat: Cell, direction: Side) {
  const barriers = cellPieces(layout).filter((piece) => piece.kind === "hedge" || piece.kind === "tree");
  const along = (side: Side) => barriers.filter((piece) => [1, 2].some((distance) => sameCell(piece, step(seat, side, distance)))).sort(byPosition);
  const back = along(OPPOSITE[direction]);
  const sides = SIDES.filter((side) => side !== direction && side !== OPPOSITE[direction]).flatMap(along);
  return { back, sides, sheltered: back.length > 0 && sides.length > 0 };
}

export function gardenView(layout: Layout, seat: Cell, direction: Side) {
  const front = step(seat, direction);
  const clear = freeFloor(layout, "plot").some((cell) => sameCell(cell, front)) && !sceneReserved(layout, front);
  const blockers = sightBlockers(layout);
  const vector = step({ x: 0, y: 0 }, direction);
  const plants = clear && direction !== "s" ? cellPieces(layout).filter((piece) => {
    if (piece.kind !== "plant" && piece.kind !== "tree") return false;
    const dx = piece.x - seat.x;
    const dy = piece.y - seat.y;
    const forward = dx * vector.x + dy * vector.y;
    const sideways = dx * vector.y - dy * vector.x;
    if (forward <= 0 || Math.abs(sideways) > forward || sceneReserved(layout, piece)) return false;
    return !supercover(seat, piece).some((cell) => !sameCell(cell, seat) && !sameCell(cell, piece) && blockers.some((blocker) => sameCell(blocker, cell)));
  }).sort(byPosition) : [];
  return { front, clear, plants };
}

export function windowCorridor(layout: Layout, seat: Cell, window: WallPiece): Cell[] | null {
  if (!inRoom(layout.room, seat)) return null;
  const inside = interiorCell(layout.room, window);
  const aligned = window.side === "n" || window.side === "s" ? seat.x === inside.x : seat.y === inside.y;
  if (!aligned) return null;
  const corridor: Cell[] = [];
  for (let cell = step(seat, window.side); inRoom(layout.room, cell); cell = step(cell, window.side)) corridor.push(cell);
  return corridor;
}
