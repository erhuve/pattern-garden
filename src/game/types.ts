export type Side = "n" | "s" | "e" | "w";

export type WallPieceKind = "window" | "door" | "alcove";
export type CellPieceKind =
  | "seat"
  | "table"
  | "plant"
  | "tree"
  | "path"
  | "gate"
  | "hearth"
  | "shelf";
export type PieceKind = WallPieceKind | CellPieceKind;

export type WallPiece = { kind: WallPieceKind; side: Side; pos: number };
export type CellPiece = { kind: CellPieceKind; x: number; y: number };
export type Piece = WallPiece | CellPiece;

export type Rect = { x: number; y: number; w: number; h: number };

export type Layout = {
  world: { w: number; h: number };
  room: Rect;
  pieces: Piece[];
};

export type CheckResult = {
  id: string;
  label: string;
  detail: string;
  points: number;
  earned: number;
  ratio: number;
};

export type Cell = { x: number; y: number };

export type Evaluation = {
  checks: CheckResult[];
  attractors: Cell[];
  score: number;
};

export type PaletteEntry = { kind: PieceKind; max: number };

export type Level = {
  number: number;
  slug: string;
  title: string;
  tagline: string;
  quote: string;
  completeLine: string;
  inhabitants: number;
  world: { w: number; h: number };
  room: Rect;
  palette: PaletteEntry[];
  starting: Piece[];
  evaluate: (layout: Layout) => { checks: CheckResult[]; attractors: Cell[] };
};

export function isWallPiece(p: Piece): p is WallPiece {
  return p.kind === "window" || p.kind === "door" || p.kind === "alcove";
}

export function isCellPiece(p: Piece): p is CellPiece {
  return !isWallPiece(p);
}

export const WALL_KINDS: ReadonlySet<PieceKind> = new Set<PieceKind>(["window", "door", "alcove"]);

export const PIECE_LABELS: Record<PieceKind, string> = {
  window: "Window",
  door: "Door",
  alcove: "Alcove",
  seat: "Seat",
  table: "Table",
  plant: "Plant",
  tree: "Tree",
  path: "Path stone",
  gate: "Gate",
  hearth: "Hearth",
  shelf: "Shelf",
};
