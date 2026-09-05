import type { Cell, CheckResult, Evaluation, Layout, Level, Rect, Side, WallPiece } from "./types";
import {
  cellPieces,
  alcoveCell,
  chebyshev,
  connectedPath,
  distinctSides,
  exteriorCell,
  inRoom,
  interiorCell,
  manhattan,
  pathTurns,
  sameCell,
  wallPieces,
} from "./geometry";

function check(
  id: string,
  label: string,
  points: number,
  ok: boolean | number,
  detail: string,
): CheckResult {
  const ratio = typeof ok === "number" ? Math.min(1, Math.max(0, ok)) : ok ? 1 : 0;
  const earned = Math.round(points * ratio);
  return { id, label, detail, points, earned, ratio };
}

function roomCells(room: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = room.y; y < room.y + room.h; y++)
    for (let x = room.x; x < room.x + room.w; x++) out.push({ x, y });
  return out;
}

const LIGHT_DEPTH = 3;

function litBy(room: Rect, win: WallPiece, c: Cell): boolean {
  const i = interiorCell(room, win);
  if (win.side === "n" || win.side === "s") {
    const depth = win.side === "n" ? c.y - i.y : i.y - c.y;
    return Math.abs(c.x - i.x) <= 1 && depth >= 0 && depth < LIGHT_DEPTH;
  }
  const depth = win.side === "w" ? c.x - i.x : i.x - c.x;
  return Math.abs(c.y - i.y) <= 1 && depth >= 0 && depth < LIGHT_DEPTH;
}

export function lightCount(layout: Layout, c: Cell): number {
  return wallPieces(layout)
    .filter((p) => p.kind === "window")
    .filter((w) => litBy(layout.room, w, c)).length;
}

function adjacentSides(a: Side, b: Side): boolean {
  const opposite: Record<Side, Side> = { n: "s", s: "n", e: "w", w: "e" };
  return a !== b && opposite[a] !== b;
}

const lightOnTwoSides: Level = {
  number: 159,
  slug: "light-on-two-sides",
  title: "Light on Two Sides of Every Room",
  tagline: "Windows on two walls, and no seat left in the dark.",
  quote:
    "When they have a choice, people will always gravitate to those rooms which have light on two sides, and leave the rooms which are lit only from one side unused and empty.",
  completeLine: "Soft cross-light models every face. People choose this room.",
  inhabitants: 3,
  world: { w: 8, h: 7 },
  room: { x: 2, y: 2, w: 4, h: 3 },
  palette: [
    { kind: "window", max: 4 },
    { kind: "seat", max: 2 },
    { kind: "table", max: 1 },
    { kind: "plant", max: 2 },
  ],
  starting: [],
  evaluate(layout) {
    const wins = wallPieces(layout).filter((p) => p.kind === "window");
    const sides = distinctSides(wins);
    const cells = roomCells(layout.room);
    const lit = cells.map((c) => lightCount(layout, c));
    const anyAdjacentPair = sides.some((a) => sides.some((b) => adjacentSides(a, b)));
    const seats = cellPieces(layout).filter((p) => p.kind === "seat");
    const seatsInDouble = seats.filter((s) => lightCount(layout, s) >= 2).length;
    const unhappy = seats.filter((s) => lightCount(layout, s) < 2);
    const requiredSeats = 2;
    const darkCells = lit.filter((n) => n === 0).length;
    const attractors = cells.filter((c) => lightCount(layout, c) >= 2);
    return {
      checks: [
        check("two-sides", "Windows on two different sides", 40, sides.length >= 2, sides.length >= 2 ? `Light arrives from ${sides.length} sides.` : wins.length === 0 ? "No windows yet — the room is a box." : "All the light comes from one direction; faces and forms flatten out."),
        check("corner", "The two sides meet at a corner", 20, anyAdjacentPair, anyAdjacentPair ? "Cross-light models every surface softly." : "Opposite windows glare at each other; adjacent walls give gentler modelling."),
        check("seats", "Both seats sit in double light", 25, seatsInDouble / requiredSeats, seats.length === 0 ? "Add both seats and put them where two windows reach." : seats.length < requiredSeats && unhappy.length === 0 ? "The first seat rests in overlapping light. Add the second seat to complete the room." : seatsInDouble === requiredSeats ? "Both seats rest in overlapping light." : `${seatsInDouble} of ${requiredSeats} seats rest in overlapping light. Light reaches 3 tiles in from each window and 1 tile to either side — any seat marked in red is outside the overlap; move it onto a dotted tile.`),
        check("no-dark", "No dark corner left over", 15, cells.length === 0 ? 0 : 1 - darkCells / cells.length, darkCells === 0 ? "Every part of the room is touched by daylight." : `${darkCells} cells never see a window.`),
      ],
      attractors,
      unhappy,
    };
  },
};

const entranceTransition: Level = {
  number: 112,
  slug: "entrance-transition",
  title: "Entrance Transition",
  tagline: "Bend the path so the street falls away before the door.",
  quote:
    "Buildings, and especially houses, with a graceful transition between the street and the inside are more tranquil than those which open directly off the street.",
  completeLine: "Visitors arrive already calmer than when they left the street.",
  inhabitants: 2,
  world: { w: 9, h: 9 },
  room: { x: 5, y: 1, w: 3, h: 3 },
  palette: [
    { kind: "door", max: 1 },
    { kind: "gate", max: 1 },
    { kind: "path", max: 14 },
    { kind: "plant", max: 4 },
    { kind: "tree", max: 2 },
  ],
  starting: [],
  evaluate(layout) {
    const door = wallPieces(layout).find((p) => p.kind === "door");
    const gate = cellPieces(layout).find((p) => p.kind === "gate");
    const paths = cellPieces(layout).filter((p) => p.kind === "path");
    const greens = cellPieces(layout).filter((p) => p.kind === "plant" || p.kind === "tree");
    let path: Cell[] | null = null;
    if (door && gate) {
      const step = exteriorCell(layout.room, door);
      path = connectedPath(paths, gate, step);
    }
    const turns = path ? pathTurns(path) : 0;
    const len = path ? path.length : 0;
    const shadedSteps = path ? path.filter((c) => greens.some((g) => chebyshev(g, c) === 1)).length : 0;
    const gateFar = door && gate ? manhattan(gate, exteriorCell(layout.room, door)) >= 3 : false;
    return {
      checks: [
        check("both", "A gate and a front door", 10, Boolean(door && gate), door && gate ? "The journey has a beginning and an end." : !door ? "The house needs a door on an outside wall." : "Mark the edge of the street with a gate."),
        check("connected", "A path joins gate to door", 25, Boolean(path), path ? `${len} steps from street to threshold.` : "Lay path stones so a visitor can walk from the gate to the door."),
        check("turn", "The path changes direction", 20, turns >= 1, turns >= 1 ? `The route bends ${turns} time${turns === 1 ? "" : "s"}; the street falls out of view.` : "A straight shot from street to door feels like a corridor."),
        check("length", "Room to slow down", 15, len === 0 ? 0 : Math.min(1, (len - 1) / 5), len >= 6 ? "Long enough to shed the street." : "A few more steps would let the mood change."),
        check("light", "A change of light along the way", 20, len === 0 ? 0 : Math.min(1, shadedSteps / 3), shadedSteps >= 3 ? "Leaves and shade fall across the walk." : "Plant beside the path so light shifts as you pass."),
        check("distance", "The gate stands off from the door", 10, gateFar, gateFar ? "The threshold is not visible from the street." : "Pull the gate further from the door."),
      ],
      attractors: path ?? [],
    };
  },
};

const windowPlace: Level = {
  number: 180,
  slug: "window-place",
  title: "Window Place",
  tagline: "A seat pulled right up to the glass, enclosed enough to be its own place.",
  quote:
    "Everybody loves window seats, bay windows, and big windows with low sills and comfortable chairs drawn up to them. A room without a place like this seldom lets you feel fully comfortable.",
  completeLine: "Someone is already curled up there with the sky at their shoulder.",
  inhabitants: 2,
  world: { w: 8, h: 7 },
  room: { x: 2, y: 2, w: 4, h: 3 },
  palette: [
    { kind: "window", max: 3 },
    { kind: "seat", max: 3 },
    { kind: "table", max: 1 },
    { kind: "shelf", max: 2 },
    { kind: "plant", max: 2 },
  ],
  starting: [],
  evaluate(layout) {
    const room = layout.room;
    const wins = wallPieces(layout).filter((p) => p.kind === "window");
    const seats = cellPieces(layout).filter((p) => p.kind === "seat");
    const windowSeats = seats.filter((s) => wins.some((w) => sameCell(interiorCell(room, w), s)));
    const isCorner = (c: Cell) =>
      (c.x === room.x || c.x === room.x + room.w - 1) && (c.y === room.y || c.y === room.y + room.h - 1);
    const furniture = cellPieces(layout).filter((p) => p.kind === "shelf" || p.kind === "table");
    const enclosed = windowSeats.filter((s) => isCorner(s) || furniture.some((f) => chebyshev(f, s) === 1));
    const paired = windowSeats.filter((s) => wins.filter((w) => chebyshev(interiorCell(room, w), s) <= 1).length >= 2);
    const green = windowSeats.filter((s) => cellPieces(layout).some((p) => p.kind === "plant" && chebyshev(p, s) === 1));
    const anySeat = windowSeats.length > 0;
    return {
      checks: [
        check("window", "A window to sit in", 10, wins.length > 0, wins.length > 0 ? "There is daylight to gather around." : "Cut a window first."),
        check("seat", "A seat pulled right up to the glass", 35, anySeat, anySeat ? "Someone can sit with the sky at their shoulder." : "Put a seat in the cell directly inside a window."),
        check("enclosure", "The window place is its own nook", 25, anySeat ? enclosed.length / windowSeats.length : 0, enclosed.length > 0 ? "A corner or a shelf wraps the seat and makes it a place." : "Tuck the seat into a corner or flank it with a shelf or table."),
        check("wrap", "Glass wraps around the seat", 15, anySeat ? paired.length / windowSeats.length : 0, paired.length > 0 ? "Two panes make a bay." : "A second window beside the first turns a seat into a bay."),
        check("green", "Something growing at the sill", 15, anySeat ? green.length / windowSeats.length : 0, green.length > 0 ? "Leaves catch the light next to the seat." : "A plant by the seat softens the edge."),
      ],
      attractors: windowSeats,
    };
  },
};

const alcoves: Level = {
  number: 179,
  slug: "alcoves",
  title: "Alcoves",
  tagline: "Small pockets off a common room, so people can be alone together.",
  quote:
    "No homogeneous room, of homogeneous height, can serve a group of people well. To give a group a chance to be together, as a group, a room must also give them the chance to be alone, in ones and twos in the same space.",
  completeLine: "The group talks at the table while a pair reads in the bay.",
  inhabitants: 4,
  world: { w: 9, h: 8 },
  room: { x: 2, y: 2, w: 5, h: 4 },
  palette: [
    { kind: "alcove", max: 3 },
    { kind: "seat", max: 5 },
    { kind: "table", max: 1 },
    { kind: "shelf", max: 2 },
    { kind: "window", max: 3 },
  ],
  starting: [{ kind: "table", x: 4, y: 3 }],
  evaluate(layout) {
    const room = layout.room;
    const alcs = wallPieces(layout).filter((p) => p.kind === "alcove");
    const seats = cellPieces(layout).filter((p) => p.kind === "seat");
    const table = cellPieces(layout).find((p) => p.kind === "table");
    const furnished = alcs.filter((a) => seats.some((s) => sameCell(s, alcoveCell(room, a))));
    const separated = alcs.every((a, i) =>
      alcs.every((b, j) => i === j || manhattan(alcoveCell(room, a), alcoveCell(room, b)) >= 2),
    );
    const nearTable = table ? furnished.filter((a) => manhattan(interiorCell(room, a), table) <= 3).length : 0;
    const lit = alcs.filter((a) => lightCount(layout, interiorCell(room, a)) > 0).length;
    return {
      checks: [
        check("common", "A common table to gather at", 10, Boolean(table), table ? "The group has somewhere to be together." : "Keep a table in the middle of the room."),
        check("count", "At least two alcoves", 25, Math.min(1, alcs.length / 2), alcs.length >= 2 ? `${alcs.length} pockets open off the room.` : "Push a bay out of the wall to make a pocket."),
        check("seated", "Each alcove has a seat", 30, alcs.length === 0 ? 0 : furnished.length / alcs.length, furnished.length === alcs.length && alcs.length > 0 ? "Every pocket invites someone to sit." : "Put a seat on the recessed floor inside each alcove."),
        check("separate", "Alcoves are distinct from each other", 15, alcs.length >= 2 && separated, separated ? "Each is a little world." : "Two alcoves side by side blur into one wide wall."),
        check("connected", "Still part of the room", 20, alcs.length === 0 ? 0 : nearTable / alcs.length, nearTable === alcs.length && alcs.length > 0 ? "You can be alone and still hear the conversation." : "Alcoves too far from the table feel like separate rooms."),
        check("light", "Alcoves catch the daylight", 0, lit, lit > 0 ? `${lit} alcove${lit === 1 ? "" : "s"} lit — a bonus.` : ""),
      ].filter((c) => c.points > 0),
      attractors: furnished.map((a) => alcoveCell(room, a)),
    };
  },
};

const sittingCircle: Level = {
  number: 185,
  slug: "sitting-circle",
  title: "Sitting Circle",
  tagline: "Seats that face each other, off the path, around a warm centre.",
  quote:
    "A group of chairs, a sofa and a chair, a pile of cushions — these are the most obvious things in everybody's life — and yet to make them work, so people become animated and alive in them, is a very subtle business.",
  completeLine: "The circle tightens and loosens as the evening goes on.",
  inhabitants: 5,
  world: { w: 9, h: 8 },
  room: { x: 2, y: 2, w: 5, h: 4 },
  palette: [
    { kind: "hearth", max: 1 },
    { kind: "seat", max: 8 },
    { kind: "table", max: 1 },
    { kind: "shelf", max: 2 },
    { kind: "window", max: 2 },
    { kind: "door", max: 1 },
  ],
  starting: [{ kind: "door", side: "s", pos: 0 }],
  evaluate(layout) {
    const room = layout.room;
    const hearth = cellPieces(layout).find((p) => p.kind === "hearth");
    const table = cellPieces(layout).find((p) => p.kind === "table");
    const focus = hearth ?? table;
    const seats = cellPieces(layout).filter((p) => p.kind === "seat");
    const door = wallPieces(layout).find((p) => p.kind === "door");
    const circle = focus ? seats.filter((s) => chebyshev(s, focus) <= 2 && !sameCell(s, focus)) : [];
    const quadrants = focus
      ? new Set(
          circle.map((s) => {
            const dx = s.x - focus.x;
            const dy = s.y - focus.y;
            if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "e" : "w";
            return dy > 0 ? "s" : "n";
          }),
        )
      : new Set<string>();
    const collinear =
      circle.length >= 3 && (circle.every((s) => s.x === circle[0].x) || circle.every((s) => s.y === circle[0].y));
    let cutByPath = false;
    if (focus && door) {
      const entry = interiorCell(room, door);
      cutByPath = chebyshev(entry, focus) <= 1 || circle.some((s) => sameCell(s, entry));
    }
    const touchesWall = focus ? circle.some((s) => s.x === room.x || s.y === room.y || s.x === room.x + room.w - 1 || s.y === room.y + room.h - 1) : false;
    return {
      checks: [
        check("focus", "A hearth or table to gather around", 10, Boolean(focus), focus ? "The circle has a centre." : "Place a hearth or a table first."),
        check("count", "Enough seats for a group", 15, Math.min(1, circle.length / 4), circle.length >= 4 ? `${circle.length} seats close in.` : "Draw at least four seats within reach of the centre."),
        check("round", "Seats surround the centre", 35, Math.min(1, Math.max(0, quadrants.size - 1) / 2), quadrants.size >= 3 ? "People can see one another's faces." : "Spread seats to at least three sides of the centre."),
        check("line", "Not a row facing a wall", 15, circle.length >= 3 && !collinear, collinear ? "A line of chairs is a waiting room." : "The seats bend towards each other."),
        check("protected", "Out of the line of movement", 15, Boolean(focus) && !cutByPath, cutByPath ? "The door path runs straight through the circle." : "The circle is off the route through the room."),
        check("loose", "A few too many chairs", 10, circle.length >= 6, circle.length >= 6 ? "Room for the group to swell." : "Add a spare seat or two."),
        check("edge", "The room suggests the circle", 0, touchesWall, ""),
      ].filter((c) => c.points > 0),
      attractors: circle,
    };
  },
};

export const LEVELS: Level[] = [lightOnTwoSides, entranceTransition, windowPlace, alcoves, sittingCircle];

export function levelBySlug(slug: string | undefined): Level | undefined {
  return LEVELS.find((l) => l.slug === slug);
}

export function evaluate(level: Level, layout: Layout): Evaluation {
  const { checks, attractors, unhappy } = level.evaluate(layout);
  const total = checks.reduce((n, c) => n + c.points, 0);
  const earned = checks.reduce((n, c) => n + c.earned, 0);
  const score = total === 0 ? 0 : Math.floor((earned / total) * 100);
  return { checks, attractors, unhappy, score };
}

export { roomCells, inRoom };
