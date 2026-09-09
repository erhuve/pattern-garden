import type { Cell, CellPiece, Layout, Level, Side, WallPiece } from "./types";
import { cellPieces, chebyshev, exteriorCell, inRoom, interiorCell, inWorld, manhattan, neighbors4, sameCell, wallLength, wallPieces } from "./geometry";
import { bestCandidate, byPosition, cellKey, freeFloor, onEdge, OPPOSITE, reachable, rule, sideOf, SIDES, step } from "./place-rules";

const ofKind = (layout: Layout, kind: CellPiece["kind"]) => cellPieces(layout).filter((p) => p.kind === kind).sort(byPosition);
const validWalls = (layout: Layout, kind: WallPiece["kind"]) => wallPieces(layout)
  .filter((p) => p.kind === kind && Number.isInteger(p.pos) && p.pos >= 0 && p.pos < wallLength(layout.room, p.side))
  .sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || a.pos - b.pos);
const adjacentTo = (cell: Cell, component: Set<string>) => neighbors4(cell).some((neighbor) => component.has(cellKey(neighbor)));
const asCells = (cells: Cell[]): Cell[] => cells.map(({ x, y }) => ({ x, y }));
const maybe = <T,>(items: T[]): (T | undefined)[] => items.length ? items : [undefined];

function alongFacade(layout: Layout, cell: Cell, side: Side): boolean {
  const room = layout.room;
  if (!inWorld(layout.world, cell) || inRoom(room, cell)) return false;
  if (side === "n" || side === "s") return cell.x >= room.x && cell.x < room.x + room.w && cell.y === (side === "n" ? room.y - 1 : room.y + room.h);
  return cell.y >= room.y && cell.y < room.y + room.h && cell.x === (side === "w" ? room.x - 1 : room.x + room.w);
}

function streetView(layout: Layout, bench: Cell, street: Side): boolean {
  const blockers = cellPieces(layout).filter((p) => p.kind === "tree" || p.kind === "hedge" || p.kind === "shelf");
  for (let cell = step(bench, street); inWorld(layout.world, cell); cell = step(cell, street)) {
    if (inRoom(layout.room, cell) || blockers.some((blocker) => sameCell(blocker, cell))) return false;
    if (onEdge(layout, cell, street)) return true;
  }
  return false;
}

const frontDoorBench: Level = {
  number: 242, slug: "front-door-bench", title: "Front Door Bench",
  tagline: "A sheltered seat at the threshold, with the street still in view.",
  quote: "A bench near the entrance gives household life a comfortable place to meet the passing street. Planting beside it can make a small, half-private territory without cutting it off from the world.",
  adaptation: "This puzzle uses one street-facing sight line and a continuous stone path. A neighboring plant, tree or hedge marks the private edge; the book allows many other ways to make this welcoming threshold. Rotation is decorative.",
  completeLine: "The door is close, the street is visible, and there is a place to linger.",
  inhabitants: 2, world: { w: 9, h: 9 }, room: { x: 2, y: 1, w: 5, h: 3 },
  outdoorFurniture: true, street: "s",
  palette: [{ kind: "bench", max: 1 }, { kind: "door", max: 1 }, { kind: "path", max: 12 }, { kind: "plant", max: 3 }, { kind: "tree", max: 2 }, { kind: "hedge", max: 4 }],
  starting: [{ kind: "door", side: "s", pos: 2 }],
  evaluate(layout) {
    const street = layout.street ?? "s";
    const floor = freeFloor(layout, "outside");
    const floorSet = new Set(floor.map(cellKey));
    const indoorSet = new Set(freeFloor(layout, "inside").map(cellKey));
    const paths = ofKind(layout, "path").filter((p) => floorSet.has(cellKey(p)));
    const streetPaths = reachable(paths, paths.filter((p) => onEdge(layout, p, street)));
    const greens = cellPieces(layout).filter((p) => ["plant", "tree", "hedge"].includes(p.kind) && !inRoom(layout.room, p));
    return bestCandidate(maybe(validWalls(layout, "door")).flatMap((door) => maybe(ofKind(layout, "bench")).map((bench) => {
      const threshold = door && exteriorCell(layout.room, door);
      const clearDoor = Boolean(door && threshold && indoorSet.has(cellKey(interiorCell(layout.room, door))) && floorSet.has(cellKey(threshold)));
      const placed = Boolean(bench && door && threshold && alongFacade(layout, bench, door.side) && manhattan(bench, threshold) > 0 && manhattan(bench, threshold) <= 2);
      const view = Boolean(bench && !inRoom(layout.room, bench) && streetView(layout, bench, street));
      const component = reachable(floor, threshold ? [threshold] : []);
      const path = Boolean(clearDoor && placed && threshold && streetPaths.has(cellKey(threshold)) && bench && component.has(cellKey(step(bench, street))));
      const privacy = Boolean(bench && greens.some((green) => manhattan(green, bench) === 1 && !sameCell(green, step(bench, street))));
      const checks = [
        rule("door", "A clear doorway, inside and out", 20, clearDoor, clearDoor ? "Both sides of the doorway are free to walk through." : "Keep a door and leave its inside and outside threshold empty or paved, not occupied by furniture or planting."),
        rule("bench", "A bench beside the same doorway", 20, placed, placed ? "The bench stands against the door's facade, within two steps and off the threshold." : "Place the bench immediately alongside the house on the same wall as the door, within two cardinal steps of its outside tile. Keep the threshold free."),
        rule("view", "An unblocked view of the street", 20, view, view ? "The bench has a clear line to the south street." : "Leave a straight view south from the bench to the street band. Trees, hedges and the building block it; turning the bench does not change the rule."),
        rule("path", "A stone route and a bench approach", 20, path, path ? "Connected stones reach from the south edge to the threshold, and a clear walk reaches the front of the bench." : "Join the south edge to the outside threshold with actual path stones, including both endpoints. From that route, leave a clear walk to the tile south of the bench."),
        rule("privacy", "A planted private edge", 20, privacy, privacy ? "Greenery beside or behind the bench marks a small private edge." : "Add a plant, tree or hedge immediately beside or behind the bench, not in its south-facing opening. A diagonal planting is not a boundary."),
      ];
      return { checks, attractors: bench && checks.every((check) => check.ratio === 1) ? asCells([bench]) : [] };
    })));
  },
};

const treePlaces: Level = {
  number: 171, slug: "tree-places", title: "Tree Places",
  tagline: "Let a grove shape a clearing where people can sit under the leaves.",
  quote: "Trees can shape places to inhabit, not just decorate leftover ground. A grove, avenue, enclosure or single spreading crown can organize the space around it and invite people to stay.",
  adaptation: "This level explores a grove, one of several tree-place forms in the book. Trees must surround one clear center on three sides within two tiles; both benches share that center and sit within one tile of a trunk. The square canopy marks the game's simplified shade, not botanical coverage. Paths and plants are optional.",
  completeLine: "The trees hold a little clearing, and both benches rest in its shade.",
  inhabitants: 3, world: { w: 9, h: 9 }, room: { x: 0, y: 0, w: 9, h: 9 }, setting: "garden", outdoorFurniture: true,
  palette: [{ kind: "tree", max: 6 }, { kind: "bench", max: 2 }, { kind: "path", max: 12 }, { kind: "plant", max: 3 }], starting: [],
  evaluate(layout) {
    const trees = ofKind(layout, "tree");
    const benches = ofKind(layout, "bench");
    const floor = freeFloor(layout, "plot");
    const edgeAccess = reachable(floor, floor.filter((cell) => onEdge(layout, cell)));
    return bestCandidate(maybe(floor).map((center) => {
      const nearTrees = center ? trees.filter((tree) => chebyshev(tree, center) <= 2) : [];
      const sides = center ? new Set(nearTrees.map((tree) => sideOf(center, tree))).size : 0;
      const row = nearTrees.length >= 2 && nearTrees.every((tree) => (tree.x - nearTrees[0].x) * (nearTrees[1].y - nearTrees[0].y) === (tree.y - nearTrees[0].y) * (nearTrees[1].x - nearTrees[0].x));
      const grove = sides >= 3 && !row;
      const shaded = center ? benches.filter((bench) => chebyshev(bench, center) <= 1 && trees.some((tree) => chebyshev(tree, bench) <= 1)) : [];
      const component = reachable(floor, center ? [center] : []);
      const reached = center && edgeAccess.has(cellKey(center)) ? shaded.filter((bench) => adjacentTo(bench, component)) : [];
      const checks = [
        rule("trees", "At least three living trees", 15, trees.length / 3, trees.length >= 3 ? `${trees.length} trees can begin to shape a place.` : "Plant at least three trees; leave space between the trunks for people."),
        rule("grove", "Trees surround one usable clearing", 35, grove, grove ? "Trees occupy at least three sides within two tiles of the same clear center." : "Keep one central lawn or path tile free, with trees within two tiles on at least three cardinal sides. A straight row is not this grove."),
        rule("shade", "Both benches share the shaded clearing", 30, shaded.length / Math.max(2, benches.length), `${shaded.length} of ${Math.max(2, benches.length)} benches are within one tile of this same center and a tree trunk, including diagonals.`),
        rule("access", "Walk into the grove and to each bench", 20, reached.length / Math.max(2, benches.length), reached.length >= 2 && reached.length === benches.length ? "An open walk joins the plot edge, the clearing and both benches. Walking under a canopy is allowed." : "Connect the clearing to any plot edge on free lawn or path. Every bench needs a cardinal approach on that same walk; trunks and furniture block it."),
      ];
      return { checks, attractors: grove ? asCells(reached) : [] };
    }));
  },
};

function frameSide(table: Cell, side: Side): Cell[] {
  const middle = step(table, side, 2);
  return [-2, -1, 0, 1, 2].map((offset) => side === "n" || side === "s" ? { x: middle.x + offset, y: middle.y } : { x: middle.x, y: middle.y + offset });
}

const outdoorRoom: Level = {
  number: 163, slug: "outdoor-room", title: "Outdoor Room",
  tagline: "Make a room of hedges, with open sky and a welcoming entrance.",
  quote: "Some outdoor life needs the shelter and definition of a room rather than an undifferentiated lawn. Boundaries and strong corners can create that feeling while leaving the sky open above.",
  adaptation: "Hedges stand in for the book's many possible boundaries. The exact 5×5 footprint, three complete sides and central table are puzzle rules, not universal architectural dimensions. Plants and path stones are optional.",
  completeLine: "Hedges hold the gathering, while an open entrance keeps it part of the garden.",
  inhabitants: 3, world: { w: 9, h: 9 }, room: { x: 0, y: 0, w: 9, h: 9 }, setting: "garden", outdoorFurniture: true,
  palette: [{ kind: "hedge", max: 16 }, { kind: "table", max: 1 }, { kind: "seat", max: 4 }, { kind: "path", max: 12 }, { kind: "plant", max: 3 }], starting: [],
  evaluate(layout) {
    const seats = ofKind(layout, "seat");
    const hedges = new Set(ofKind(layout, "hedge").map(cellKey));
    const floor = freeFloor(layout, "plot");
    const floorSet = new Set(floor.map(cellKey));
    const fromEdge = reachable(floor, floor.filter((cell) => onEdge(layout, cell)));
    return bestCandidate(maybe(ofKind(layout, "table")).map((table) => {
      const fits = Boolean(table && SIDES.every((side) => frameSide(table, side).every((cell) => inWorld(layout.world, cell))));
      const completeSides = table ? SIDES.filter((side) => frameSide(table, side).every((cell) => hedges.has(cellKey(cell)))).length : 0;
      const inside = table ? seats.filter((seat) => chebyshev(seat, table) === 1) : [];
      const innerFloor = table ? floor.filter((cell) => chebyshev(cell, table) <= 1) : [];
      const entrances = fits && table ? SIDES.flatMap((side) => frameSide(table, side).slice(1, 4).flatMap((opening) => {
        const inner = step(opening, OPPOSITE[side]);
        const outer = step(opening, side);
        const approach = onEdge(layout, opening, side) || fromEdge.has(cellKey(outer));
        return floorSet.has(cellKey(opening)) && floorSet.has(cellKey(inner)) && approach ? [inner] : [];
      })) : [];
      const shared = bestCandidate(maybe(entrances).map((entrance) => {
        const component = reachable(innerFloor, entrance ? [entrance] : []);
        const reached = inside.filter((seat) => adjacentTo(seat, component));
        return { reached, checks: [rule("shared", "", 1, reached.length / Math.max(2, seats.length), "")] };
      })).reached;
      const checks = [
        rule("room", "A table with room for a 5×5 frame", 15, fits, fits ? "The table centers a full 5×5 footprint, with a 3×3 furnished interior." : "Place the table at least two tiles from every plot edge so the full hedge frame fits around it."),
        rule("walls", "Three whole sides made of hedge", 35, fits ? completeSides / 3 : 0, completeSides >= 3 && fits ? `${completeSides} complete sides define the corners of an outdoor room.` : "Build three full five-tile hedge sides, two tiles from the table. Shared corners mean at least 13 hedge tiles; scattered plants do not make walls."),
        rule("seats", "At least two seats inside the room", 20, inside.length / Math.max(2, seats.length), `${inside.length} of ${Math.max(2, seats.length)} seats sit in the inner 3×3 area around this table. All placed seats must belong to this room.`),
        rule("entrance", "An entrance from the surrounding garden", 15, entrances.length > 0, entrances.length > 0 ? "A clear gap in the frame connects the interior to a walk from the plot edge." : "Leave an unoccupied opening through the fourth side with free floor immediately inside. Reach it from the plot edge through free floor outside, or put the opening on that edge. Four closed sides seal the room."),
        rule("access", "Every seat joins the same open floor", 15, shared.length / Math.max(2, seats.length), shared.length >= 2 && shared.length === seats.length ? "All seats have a cardinal approach from one shared inner-floor area reached through the entrance." : "Leave a connected patch of free inner floor from the entrance to a side of every chair. Do not box in a seat or split the interior with furniture."),
      ];
      return { checks, attractors: fits && completeSides >= 3 && shared.length >= 2 && shared.length === seats.length ? asCells(shared) : [] };
    }));
  },
};

function enclosureWeight(layout: Layout, chair: Cell, side: Side): number {
  const next = step(chair, side);
  if (inRoom(layout.room, next)) return ofKind(layout, "shelf").some((shelf) => sameCell(shelf, next)) ? 1 : 0;
  const opening = wallPieces(layout).find((wall) => wall.side === side && sameCell(interiorCell(layout.room, wall), chair));
  return opening ? opening.kind === "window" ? 0.5 : 0 : 1;
}

function workspaceView(layout: Layout, chair: Cell, desk: Cell, front: Side): boolean {
  const pieces = cellPieces(layout);
  return validWalls(layout, "window").some((window) => {
    if (window.side === OPPOSITE[front]) return false;
    const target = interiorCell(layout.room, window);
    if ((window.side === "n" || window.side === "s") ? target.x !== chair.x : target.y !== chair.y) return false;
    for (let cell = chair; inRoom(layout.room, cell); cell = step(cell, window.side)) {
      if (!sameCell(cell, chair) && pieces.some((piece) => sameCell(piece, cell) && !sameCell(piece, desk) && ["shelf", "desk", "hedge", "tree"].includes(piece.kind))) return false;
      if (sameCell(cell, target)) return true;
    }
    return false;
  });
}

const workspaceEnclosure: Level = {
  number: 183, slug: "workspace-enclosure", title: "Workspace Enclosure",
  tagline: "A protected back, a view out, and room to look up from work.",
  quote: "A useful workspace balances shelter with connection. Give the worker a defined place, a view beyond the desk, and an open front leading into a larger shared space rather than a closed box.",
  adaptation: "A chair and desk define the work direction; manual rotation is decorative. Adjacent shelves and solid walls count as one enclosed side, windows as half, with two to three enclosed sides required. This tile model does not reproduce the book's area, opening-width or coworker-count recommendations. The view uses a straight cardinal ray through real glazing.",
  completeLine: "There is shelter at your back, daylight at your side, and room beyond the work.",
  inhabitants: 2, world: { w: 10, h: 9 }, room: { x: 2, y: 2, w: 6, h: 5 },
  palette: [{ kind: "desk", max: 1 }, { kind: "seat", max: 1 }, { kind: "shelf", max: 5 }, { kind: "window", max: 3 }, { kind: "plant", max: 2 }, { kind: "door", max: 1 }],
  starting: [{ kind: "door", side: "s", pos: 0 }],
  evaluate(layout) {
    const floor = freeFloor(layout, "inside");
    const floorSet = new Set(floor.map(cellKey));
    const outside = new Set(freeFloor(layout, "outside").map(cellKey));
    const doors = validWalls(layout, "door").filter((door) => outside.has(cellKey(exteriorCell(layout.room, door))));
    const fromDoor = reachable(floor, doors.map((door) => interiorCell(layout.room, door)));
    return bestCandidate(maybe(ofKind(layout, "desk")).flatMap((desk) => maybe(ofKind(layout, "seat")).map((chair) => {
      const pair = Boolean(chair && desk && inRoom(layout.room, chair) && inRoom(layout.room, desk) && manhattan(chair, desk) === 1);
      const front = chair && desk ? sideOf(chair, desk) : "s";
      const weights = SIDES.map((side) => chair ? enclosureWeight(layout, chair, side) : 0);
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      const back = chair ? enclosureWeight(layout, chair, OPPOSITE[front]) : 0;
      const sideWeights = SIDES.filter((side) => side !== front && side !== OPPOSITE[front]).map((side) => chair ? enclosureWeight(layout, chair, side) : 0);
      const privacy = pair && back === 1 && sideWeights.some((weight) => weight === 1) && total >= 2 && total <= 3;
      const forward = desk ? [step(desk, front), step(desk, front, 2)] : [];
      const common = reachable(floor, forward.slice(0, 1));
      const open = pair && forward.every((cell) => floorSet.has(cellKey(cell))) && common.size >= 4 && forward.some((cell) => neighbors4(cell).some((neighbor) => sideOf(cell, neighbor) !== front && sideOf(cell, neighbor) !== OPPOSITE[front] && common.has(cellKey(neighbor))));
      const view = Boolean(pair && chair && desk && workspaceView(layout, chair, desk, front));
      const circulation = Boolean(pair && chair && adjacentTo(chair, fromDoor) && forward.length === 2 && forward.every((cell) => fromDoor.has(cellKey(cell))));
      const checks = [
        rule("pair", "A chair at a working desk", 15, pair, pair ? "The chair sits directly beside its desk, defining a working direction." : "Put the chair one cardinal tile from the desk, both inside. A diagonal or distant chair is not a working pair."),
        rule("privacy", "A protected back and one sheltered side", 25, privacy, privacy ? `Shelves and walls protect the back and a side; ${total} of four sides are enclosed.` : "Immediately behind the chair and on at least one side, add a shelf or use a solid room wall. Windows count half but cannot alone protect the back. Keep total enclosure between two and three sides."),
        rule("front", "An open front into a larger room", 20, open, open ? "Two free tiles beyond the desk open sideways into a connected area of at least four free floor tiles." : "Leave two free tiles straight beyond the desk, connected to at least four free floor tiles with a sideways opening beside those forward tiles. A narrow sealed pocket is not a larger room."),
        rule("view", "A real window in front or to the side", 20, view, view ? "A straight sight line from the chair reaches outside through a front or side window." : "Align a window with the chair's row or column, in front or to a side. Shelves and other desks block the ray; the worker's own low desk does not. A window behind the chair does not count."),
        rule("circulation", "A clear way from the door to work", 20, circulation, circulation ? "The door reaches a side of the chair and both forward floor tiles without crossing furniture." : "Keep both door thresholds free, and leave a cardinal floor route from the door to a side of the chair and the two tiles beyond the desk. Walking through the chair or desk is not allowed."),
      ];
      return { checks, attractors: chair && privacy && open && view && circulation ? asCells([chair]) : [] };
    })));
  },
};

export const EXPANDED_LEVELS: Level[] = [frontDoorBench, treePlaces, outdoorRoom, workspaceEnclosure].map((level) => ({ ...level, obstacleAware: true }));
