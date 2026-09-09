import type { Cell, CellPiece, CheckResult, Layout, Level, WallPiece } from "./types";
import { cellPieces, exteriorCell, inRoom, interiorCell, inWorld, neighbors4, sameCell, wallLength, wallPieces } from "./geometry";
import { bestCandidate, byPosition, cellKey, freeFloor, OPPOSITE, reachable, rule, SIDES, step } from "./place-rules";
import { resolveFacing } from "./orientation";
import { gardenSunny, sceneEndpoints, sceneReserved } from "./scene-rules";
import { gardenShelter, gardenView, supercover } from "./living-rules";

type Mark = NonNullable<CheckResult["marks"]>[number];
const mark = (cell: Cell, tone: Mark["tone"], label?: string): Mark => ({ cell: { x: cell.x, y: cell.y }, tone, ...(label ? { label } : {}) });
const marked = (check: CheckResult, marks: Mark[]): CheckResult => ({ ...check, marks: [...new Map(marks.map((item) => [`${cellKey(item.cell)}:${item.tone}:${item.label ?? ""}`, item])).values()].sort((a, b) => byPosition(a.cell, b.cell) || a.tone.localeCompare(b.tone) || (a.label ?? "").localeCompare(b.label ?? "")) });
const plain = (cells: Cell[]): Cell[] => cells.map(({ x, y }) => ({ x, y }));
const ofKind = (layout: Layout, kind: CellPiece["kind"]) => cellPieces(layout).filter((piece) => piece.kind === kind).sort(byPosition);
const validCell = (layout: Layout, cell: Cell) => Number.isInteger(cell.x) && Number.isInteger(cell.y) && inWorld(layout.world, cell) && cellPieces(layout).filter((piece) => sameCell(piece, cell)).length === 1;
const validWalls = (layout: Layout, kind: WallPiece["kind"]) => wallPieces(layout).filter((wall) => wall.kind === kind && Number.isInteger(wall.pos) && wall.pos >= 0 && wall.pos < wallLength(layout.room, wall.side) && wallPieces(layout).filter((other) => other.side === wall.side && other.pos === wall.pos).length === 1).sort((a, b) => SIDES.indexOf(a.side) - SIDES.indexOf(b.side) || a.pos - b.pos);
const tall = (piece: CellPiece) => ["shelf", "tree", "hedge", "seat", "bench", "desk", "hearth"].includes(piece.kind);
const maybe = <T,>(items: T[]): (T | undefined)[] => items.length ? items : [undefined];

function promenade(layout: Layout): Cell[] {
  return Array.from({ length: layout.world.w }, (_, x) => ({ x, y: layout.world.h - 1 })).filter((cell) => sceneReserved(layout, cell));
}

function doorComponent(layout: Layout, pos: number): Set<string> {
  const door = validWalls(layout, "door").find((wall) => wall.side === "n" && wall.pos === pos);
  if (!door) return new Set();
  const outside = exteriorCell(layout.room, door);
  if (!freeFloor(layout, "outside").some((cell) => sameCell(cell, outside))) return new Set();
  return reachable(freeFloor(layout, "inside"), [interiorCell(layout.room, door)]);
}

function southRay(layout: Layout, start: Cell): Cell[] {
  const ray: Cell[] = [];
  for (let cell = start; inWorld(layout.world, cell); cell = step(cell, "s")) ray.push(cell);
  return ray;
}

function sightCells(from: Cell, to: Cell): Cell[] {
  return supercover(from, to).filter((cell) => !sameCell(cell, from));
}

const overlookingLife: Level = {
  number: 192, slug: "windows-overlooking-life", title: "Windows Overlooking Life",
  tagline: "Two places to sit, with ordinary life passing outside.",
  quote: "Windows become places to linger when they look onto activity: a garden walk, a street, or people coming and going. The view connects a room to the life around it.",
  adaptation: "This puzzle fixes a public garden walk along the south edge. Two distinct south windows need clear straight views to it, and two chairs must each face south toward a different aligned window. Shelves and other seats block those views; low tables and plants do not. Both chairs need a free cardinal approach from the starting north door. These tile rules are a simplified interpretation, not dimensions prescribed by the book.",
  completeLine: "Both window places belong to the room, and the room belongs to the passing day.",
  inhabitants: 2, world: { w: 9, h: 9 }, room: { x: 2, y: 1, w: 5, h: 4 }, scene: "overlooking-life", obstacleAware: true,
  palette: [{ kind: "window", max: 4 }, { kind: "seat", max: 2 }, { kind: "shelf", max: 2 }, { kind: "plant", max: 3 }, { kind: "door", max: 1 }],
  starting: [{ kind: "door", side: "n", pos: 2 }],
  evaluate(layout) {
    const blockers = cellPieces(layout).filter(tall);
    const windows = validWalls(layout, "window");
    const windowData = windows.map((window) => {
      const ray = window.side === "s" ? southRay(layout, exteriorCell(layout.room, window)) : [];
      const blocked = ray.filter((cell) => blockers.some((piece) => sameCell(piece, cell)));
      return { window, ray, blocked, good: ray.length > 0 && sceneReserved(layout, ray[ray.length - 1]) && blocked.length === 0 };
    });
    const goodWindows = windowData.filter((item) => item.good);
    const seats = ofKind(layout, "seat");
    const component = doorComponent(layout, 2);
    const seatData = seats.map((seat) => {
      const valid = validCell(layout, seat) && inRoom(layout.room, seat);
      const direction = resolveFacing("windows-overlooking-life", layout, seat).direction;
      const aligned = goodWindows.filter(({ window }) => interiorCell(layout.room, window).x === seat.x);
      const corridor = valid ? southRay(layout, step(seat, "s")).filter((cell) => inRoom(layout.room, cell)) : [];
      const blocked = corridor.filter((cell) => blockers.some((piece) => sameCell(piece, cell)));
      return { seat, corridor, blocked, direction, window: valid && direction === "s" && !blocked.length ? aligned[0]?.window : undefined, reached: valid && neighbors4(seat).some((cell) => component.has(cellKey(cell))) };
    });
    const matched = new Set<string>();
    const views = seatData.filter((item) => {
      if (!item.window) return false;
      const key = `${item.window.side}:${item.window.pos}`;
      if (matched.has(key)) return false;
      matched.add(key);
      return true;
    });
    const reached = seatData.filter((item) => item.reached);
    const count = Math.max(2, seats.length);
    const checks = [
      marked(rule("windows", "Two windows overlooking the walk", 30, goodWindows.length / 2, `${goodWindows.length} of 2 required windows face the south promenade with a clear outside ray. Side windows and rays blocked by tall pieces do not count.`), windowData.flatMap(({ window, ray, blocked, good }) => [mark(interiorCell(layout.room, window), good ? "good" : "bad", good ? "Looks onto life" : "No promenade view"), ...ray.map((cell) => mark(cell, blocked.some((other) => sameCell(other, cell)) ? "bad" : "hint", blocked.some((other) => sameCell(other, cell)) ? "View blocked" : undefined))])),
      marked(rule("seats", "Two seats inside the room", 15, seats.filter((seat) => validCell(layout, seat) && inRoom(layout.room, seat)).length / count, `${seats.filter((seat) => validCell(layout, seat) && inRoom(layout.room, seat)).length} of ${count} seats are inside the room. Place both chairs; spare windows cannot replace a place to sit.`), seats.map((seat) => mark(seat, validCell(layout, seat) && inRoom(layout.room, seat) ? "good" : "bad", "Indoor seat"))),
      marked(rule("views", "Both chairs face their own visible window", 30, views.length / count, `${views.length} of ${count} chairs face south along a clear column to distinct overlooking windows. A chair cannot see through another chair or shelf; a spare window cannot rescue a blind seat.`), seatData.flatMap((item) => [mark(item.seat, views.includes(item) ? "good" : "bad", item.direction !== "s" ? "Face south" : !item.window ? "Blocked or unaligned view" : views.includes(item) ? "Window view" : "Window already shared"), ...item.blocked.map((cell) => mark(cell, "bad", "View blocked"))])),
      marked(rule("access", "Both chairs join the main room", 25, reached.length / count, `${reached.length} of ${count} chairs have a free cardinal approach from the north door. Keep both door thresholds clear; neither windows nor furniture are walking routes.`), [...seatData.map((item) => mark(item.seat, item.reached ? "good" : "bad", item.reached ? "Approach open" : "Seat isolated")), mark({ x: layout.room.x + 2, y: layout.room.y }, component.size ? "good" : "bad", "Door threshold")]),
    ];
    return { checks, attractors: checks.every((check) => check.ratio === 1) ? plain(seats) : [] };
  },
};

const eatingAtmosphere: Level = {
  number: 182, slug: "eating-atmosphere", title: "Eating Atmosphere",
  tagline: "A warm island of light, with room to pull up a chair.",
  quote: "A meal feels like a shared occasion when light gathers around the table and the surrounding room recedes. A comfortable place to sit helps people settle into that small circle.",
  adaptation: "One lamp attaches to one table and creates the visible warm island; its decorative glow has no hidden scoring radius. Four chairs occupy the four cardinal sides and face the table. Each chair needs its own empty pullback tile one step behind it, connected to the fixed north door without crossing furniture. Plants and shelves are optional. This is a compact lighting-and-clearance puzzle, not a lighting simulation.",
  completeLine: "The table glows, and everyone can pull out a chair and join the meal.",
  inhabitants: 4, world: { w: 9, h: 9 }, room: { x: 1, y: 1, w: 7, h: 6 }, scene: "eating-atmosphere", obstacleAware: true,
  palette: [{ kind: "table", max: 1 }, { kind: "seat", max: 4 }, { kind: "lamp", max: 1 }, { kind: "plant", max: 2 }, { kind: "shelf", max: 2 }],
  starting: [{ kind: "door", side: "n", pos: 3 }],
  evaluate(layout) {
    const tables = ofKind(layout, "table");
    const seats = ofKind(layout, "seat");
    const floor = new Set(freeFloor(layout, "inside").map(cellKey));
    const component = doorComponent(layout, 3);
    return bestCandidate(maybe(tables).map((table) => {
      const valid = Boolean(table && validCell(layout, table) && inRoom(layout.room, table));
      const sides = SIDES.map((side) => {
        const cell = table && step(table, side);
        const seat = valid && cell ? seats.find((piece) => sameCell(piece, cell) && validCell(layout, piece) && inRoom(layout.room, piece)) : undefined;
        const facing = Boolean(seat && resolveFacing("eating-atmosphere", layout, seat).direction === OPPOSITE[side]);
        const pullback = table && step(table, side, 2);
        const clear = Boolean(pullback && floor.has(cellKey(pullback)));
        const reached = Boolean(seat && clear && pullback && component.has(cellKey(pullback)));
        return { cell, seat, facing, pullback, clear, reached };
      });
      const facing = sides.filter((item) => item.facing).length;
      const accessible = sides.filter((item) => item.reached).length;
      const lamp = Boolean(valid && table?.lamp === true);
      const checks = [
        marked(rule("table", "One table for this meal", 15, valid && tables.length === 1, valid && tables.length === 1 ? "One table anchors the meal." : "Place one table inside the room, leaving two tiles toward each chair's pullback space."), table ? [mark(table, valid && tables.length === 1 ? "good" : "bad", "Meal table")] : []),
        marked(rule("chairs", "Four chairs facing the same table", 30, facing / Math.max(4, seats.length), `${facing} of ${Math.max(4, seats.length)} chairs occupy distinct cardinal sides and face this table. Diagonal seats and chairs facing away do not count.`), sides.flatMap((item) => item.cell && inWorld(layout.world, item.cell) ? [mark(item.cell, item.facing ? "good" : "bad", !item.seat ? "Chair here" : !item.facing ? "Face the table" : "Facing the meal")] : [])),
        marked(rule("lamp", "A warm lamp on this table", 25, lamp, lamp ? "The attached lamp lights the meal; the rest of the room can stay quiet." : "Select Lamp and tap the table. A lamp is attached to its table, not placed on the floor."), table ? [mark(table, lamp ? "good" : "bad", lamp ? "Warm island" : "Add table lamp")] : []),
        marked(rule("access", "Room to pull back every chair", 30, accessible / Math.max(4, seats.length), `${accessible} of ${Math.max(4, seats.length)} pullback spaces are free and joined to the north door. Leave one tile directly behind each chair; a side approach or a walk through the table is not enough.`), [...sides.flatMap((item) => item.pullback && inWorld(layout.world, item.pullback) ? [mark(item.pullback, item.reached ? "good" : "bad", !item.clear ? "Pullback blocked" : !item.reached ? "Pullback unreachable" : "Pullback clear")] : item.cell && inWorld(layout.world, item.cell) ? [mark(item.cell, "bad", "No pullback space")] : []), mark({ x: layout.room.x + 3, y: layout.room.y }, component.size ? "good" : "bad", "Door threshold")]),
      ];
      return { checks, attractors: checks.every((check) => check.ratio === 1) ? plain(seats) : [] };
    }));
  },
};

const gardenSeat: Level = {
  number: 176, slug: "garden-seat", title: "Garden Seat",
  tagline: "Find a sunny refuge, away from the passing crowd.",
  quote: "A garden seat can offer a small retreat: somewhere sheltered enough to rest, with sunlight and a view into growing things. The route to it matters as much as the seat itself.",
  adaptation: "One bench needs a hedge or tree directly behind it and on a side, each one or two tiles away. Hedges or trunks must interrupt the tile-intersecting sight ray from every tile of the busy south walk. Face north, east or west toward visible planting in the forward 90-degree cone, with a free tile in front. The visible fixed-afternoon map shades a cell behind an immediately southern hedge, or a southern tree within three rows and one column. Reach the bench across free lawn or stones; paving is optional. These are explicit miniature rules, not a solar or privacy simulation.",
  completeLine: "The walk slips out of sight; the bench keeps its sunshine and garden view.",
  inhabitants: 1, world: { w: 9, h: 9 }, room: { x: 0, y: 0, w: 9, h: 9 }, scene: "garden-seat", setting: "garden", outdoorFurniture: true, obstacleAware: true,
  palette: [{ kind: "bench", max: 1 }, { kind: "hedge", max: 12 }, { kind: "plant", max: 4 }, { kind: "tree", max: 2 }, { kind: "path", max: 12 }], starting: [],
  evaluate(layout) {
    const benches = ofKind(layout, "bench");
    const barriers = cellPieces(layout).filter((piece) => piece.kind === "hedge" || piece.kind === "tree").sort(byPosition);
    const floor = freeFloor(layout, "plot");
    const free = new Set(floor.map(cellKey));
    const busy = promenade(layout);
    const component = reachable(floor, busy);
    return bestCandidate(maybe(benches).map((bench) => {
      const valid = Boolean(bench && validCell(layout, bench) && !sceneReserved(layout, bench));
      const direction = bench ? resolveFacing("garden-seat", layout, bench).direction : "n";
      const { back, sides, sheltered: closeShelter } = bench ? gardenShelter(layout, bench, direction) : { back: [], sides: [], sheltered: false };
      const sheltered = valid && benches.length === 1 && closeShelter;
      const exposed = valid && bench ? busy.filter((cell) => !sightCells(bench, cell).some((rayCell) => barriers.some((piece) => !sameCell(piece, bench) && sameCell(piece, rayCell)))) : busy;
      const privateSeat = valid && busy.length > 0 && exposed.length === 0;
      const front = bench && step(bench, direction);
      const open = Boolean(valid && front && free.has(cellKey(front)) && !sceneReserved(layout, front));
      const plants = valid && bench && open && direction !== "s" ? gardenView(layout, bench, direction).plants.filter((piece) => validCell(layout, piece)) : [];
      const sunny = Boolean(valid && bench && gardenSunny(layout, bench));
      const approaches = bench ? neighbors4(bench).filter((cell) => inWorld(layout.world, cell)) : [];
      const access = valid && approaches.some((cell) => component.has(cellKey(cell)));
      const checks = [
        marked(rule("shelter", "A sheltered back and side", 20, sheltered, sheltered ? "A hedge or tree lies directly behind the solitary bench and on a side, each within two tiles." : "Keep one bench. Add a hedge or tree in its exact rear row or column, one or two tiles away, and another on a side within the same distance. Diagonal planting is not this close shelter."), [...(bench ? [mark(bench, sheltered ? "good" : "bad", "Sheltered seat")] : []), ...[...back, ...sides].map((cell) => mark(cell, "good", "Close shelter"))]),
        marked(rule("privacy", "Out of sight of the entire busy walk", 20, privateSeat, privateSeat ? "Hedges or trees interrupt every tile-intersecting ray between the bench and the promenade." : `${exposed.length} of ${busy.length} promenade tiles can still see the bench. Screen the marked rays with hedges or trees; ordinary plants do not screen the crowd.`), [...(bench ? [mark(bench, privateSeat ? "good" : "bad", privateSeat ? "Private refuge" : "Exposed seat")] : []), ...exposed.map((cell) => mark(cell, "bad", "Visible from here")), ...(bench && exposed.length ? sightCells(bench, exposed[0]).filter((cell) => !sceneReserved(layout, cell)).map((cell) => mark(cell, "hint", "Open sight ray")) : [])]),
        marked(rule("view", "Face into planting with an open front", 20, plants.length > 0, plants.length ? "The bench faces away from the south walk, with a free front tile and visible planting in its forward cone." : direction === "s" ? "Turn away from the busy south walk. Face north, east or west into visible planting." : "Keep the tile immediately in front free, then place a plant or tree ahead within the forward 90-degree cone. A screen across that view blocks it."), [...(bench ? [mark(bench, plants.length ? "good" : "bad", direction === "s" ? "Face away from crowd" : "Garden view")] : []), ...(front && inWorld(layout.world, front) ? [mark(front, open ? "good" : "bad", open ? "Front open" : "Front blocked")] : []), ...plants.map((cell) => mark(cell, "good", "Visible planting"))]),
        marked(rule("sun", "A sunny place to sit", 20, sunny, sunny ? "The bench lies in a sunny cell on the fixed-afternoon map." : "Check the sun map. A hedge immediately south shades this cell; a tree south within three rows and one column shades it too. A backing hedge two tiles south leaves the bench sunny."), bench ? [mark(bench, sunny ? "good" : "bad", sunny ? "Sunny bench" : "Bench in shade")] : []),
        marked(rule("access", "A walk from the promenade to the bench", 20, access, access ? "Free lawn or stones connect the promenade to a cardinal neighbor of the bench." : "Leave an unblocked cardinal walk from the promenade to one side of the bench. A visible opening or diagonal gap is not enough; paving the lawn is optional."), approaches.map((cell) => mark(cell, component.has(cellKey(cell)) ? "good" : "bad", component.has(cellKey(cell)) ? "Approach open" : free.has(cellKey(cell)) ? "Approach isolated" : "Approach blocked"))),
      ];
      return { checks, attractors: bench && checks.every((check) => check.ratio === 1) ? plain([bench]) : [] };
    }));
  },
};

type RouteCost = [number, number, number, number];
const compareCost = (a: RouteCost, b: RouteCost) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3];

function bestWalk(layout: Layout, paths: Map<string, CellPiece>, endpoints: Cell[]): Cell[] {
  if (endpoints.length !== 2) return [];
  const floor = freeFloor(layout, "plot").sort(byPosition);
  const allowed = new Map(floor.map((cell) => [cellKey(cell), cell]));
  const [start, end] = endpoints.map(cellKey);
  if (!allowed.has(start) || !allowed.has(end)) return [];
  const endSet = new Set(endpoints.map(cellKey));
  const distances = new Map<string, RouteCost>([[start, [0, 0, 0, 0]]]);
  const previous = new Map<string, string>();
  const pending = new Set([start]);
  while (pending.size) {
    const key = [...pending].sort((a, b) => compareCost(distances.get(a)!, distances.get(b)!) || byPosition(allowed.get(a)!, allowed.get(b)!))[0];
    pending.delete(key);
    if (key === end) {
      const route: Cell[] = [];
      let at: string | undefined = end;
      while (at !== undefined) { route.unshift(allowed.get(at)!); at = previous.get(at); }
      return route;
    }
    for (const cell of neighbors4(allowed.get(key)!).sort(byPosition)) {
      const next = cellKey(cell);
      if (!allowed.has(next)) continue;
      const piece = paths.get(next);
      const endpoint = endSet.has(next);
      const old = distances.get(key)!;
      const cost: RouteCost = [old[0] + Number(!endpoint && !piece), old[1] + Number(!endpoint && piece?.trellis !== true), old[2] + Number(!endpoint && !(piece?.trellis && piece.climbingPlant)), old[3] + 1];
      const current = distances.get(next);
      if (current && compareCost(current, cost) <= 0) continue;
      distances.set(next, cost);
      previous.set(next, key);
      pending.add(next);
    }
  }
  return [];
}

const trellisedWalk: Level = {
  number: 174, slug: "trellised-walk", title: "Trellised Walk",
  tagline: "Make a planted passage, open at the sides and green overhead.",
  quote: "A trellised walk gives a garden journey a recognizable shape. The overhead structure and climbing plants make the path feel like a place, while its open sides keep it part of the garden.",
  adaptation: "Join the two already-paved endpoints with cardinal path stones. Attach a square trellis to every stone on one continuous route, then add a plant to each of those trellised stones for climbing vines. Endpoints need neither stones nor cover. The chosen route minimizes missing stones, then missing roofs, then missing vines, then length, so a complete planted detour beats an uncovered shortcut. Extra off-route pieces are optional and cannot combine into a false complete walk; the four-post roofs need no rotation.",
  completeLine: "A single green-roofed walk connects both ends of the garden.",
  inhabitants: 2, world: { w: 9, h: 7 }, room: { x: 0, y: 0, w: 9, h: 7 }, scene: "trellised-walk", setting: "garden", outdoorFurniture: true, obstacleAware: true,
  palette: [{ kind: "path", max: 14 }, { kind: "trellis", max: 14 }, { kind: "plant", max: 16 }, { kind: "bench", max: 1 }], starting: [],
  evaluate(layout) {
    const endpoints = sceneEndpoints(layout);
    const free = new Set(freeFloor(layout, "plot").map(cellKey));
    const paths = new Map(ofKind(layout, "path").filter((piece) => validCell(layout, piece) && free.has(cellKey(piece)) && !sceneReserved(layout, piece)).map((piece) => [cellKey(piece), piece]));
    const route = bestWalk(layout, paths, endpoints);
    const inside = route.filter((cell) => !sceneReserved(layout, cell));
    const gaps = inside.filter((cell) => !paths.has(cellKey(cell)));
    const connected = endpoints.length === 2 && route.length > 0 && gaps.length === 0;
    const entries = endpoints.filter((endpoint) => free.has(cellKey(endpoint)) && neighbors4(endpoint).some((cell) => paths.has(cellKey(cell))));
    const roofs = inside.filter((cell) => paths.get(cellKey(cell))?.trellis === true);
    const vines = roofs.filter((cell) => paths.get(cellKey(cell))?.climbingPlant === true);
    const checks = [
      marked(rule("entries", "Meet both already-paved endpoints", 15, entries.length / 2, `${entries.length} of 2 endpoints have a free cardinal path connection. Place stones beside the marked pavement, never on top of it.`), endpoints.map((cell) => mark(cell, entries.some((entry) => sameCell(entry, cell)) ? "good" : "bad", "Join beside this end"))),
      marked(rule("route", "One continuous stone walk", 35, connected, connected ? "One cardinal stone route joins both endpoints without crossing furniture." : route.length ? `${gaps.length} stone ${gaps.length === 1 ? "gap remains" : "gaps remain"} along the suggested walk. Diagonals do not join; furniture cannot be a path endpoint.` : "Clear a walk between the endpoints. Furniture and planting cannot be walked through."), route.length ? inside.map((cell) => mark(cell, paths.has(cellKey(cell)) ? "good" : "bad", paths.has(cellKey(cell)) ? "Connected stone" : "Stone gap")) : endpoints.flatMap((cell) => [mark(cell, "bad", "Walk blocked"), ...neighbors4(cell).filter((next) => inWorld(layout.world, next) && !free.has(cellKey(next))).map((next) => mark(next, "bad", "Entry blocked"))])),
      marked(rule("cover", "A trellis over every route stone", 25, roofs.length / Math.max(1, inside.length), `${roofs.length} of ${inside.length || "the required"} route tiles have a trellis. Select Trellis, then tap each path stone. Off-route roofs do not fill a gap here.`), inside.map((cell) => mark(cell, paths.get(cellKey(cell))?.trellis ? "good" : "bad", paths.get(cellKey(cell))?.trellis ? "Covered walk" : paths.has(cellKey(cell)) ? "Missing trellis" : "Stone before roof"))),
      marked(rule("vines", "Living vines along the same walk", 25, vines.length / Math.max(1, inside.length), `${vines.length} of ${inside.length || "the required"} route tiles have planted trellises. Select Plant and tap each trellised path. Floor plants and disconnected vines do not cover this walk.`), inside.map((cell) => mark(cell, paths.get(cellKey(cell))?.trellis && paths.get(cellKey(cell))?.climbingPlant ? "good" : "bad", paths.get(cellKey(cell))?.trellis && paths.get(cellKey(cell))?.climbingPlant ? "Planted canopy" : paths.get(cellKey(cell))?.trellis ? "Bare canopy" : "Trellis before vine"))),
    ];
    return { checks, attractors: checks.every((check) => check.ratio === 1) ? plain(inside) : [] };
  },
};

export const LIVING_LEVELS: Level[] = [overlookingLife, eatingAtmosphere, gardenSeat, trellisedWalk];
