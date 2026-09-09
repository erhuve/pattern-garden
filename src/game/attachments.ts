import type { Cell, Piece } from "./types";
import { sameCell } from "./geometry";

export type AttachmentLayer = "lamp" | "trellis" | "climbingPlant";

export function attachmentsAt(pieces: Piece[], cell: Cell): AttachmentLayer[] {
  const host = pieces.find((p) => "x" in p && sameCell(p, cell));
  if (host?.kind === "table" && host.lamp) return ["lamp"];
  if (host?.kind === "path" && host.trellis) return host.climbingPlant ? ["climbingPlant", "trellis"] : ["trellis"];
  return [];
}

export function removeAttachment(pieces: Piece[], cell: Cell, layer: AttachmentLayer): Piece[] {
  return pieces.map((p) => {
    if (!("x" in p) || !sameCell(p, cell)) return p;
    if (p.kind === "table" && layer === "lamp") { const { lamp: _, ...rest } = p; return rest; }
    if (p.kind === "path" && layer === "trellis") { const { trellis: _, climbingPlant: _plant, ...rest } = p; return rest; }
    if (p.kind === "path" && layer === "climbingPlant") { const { climbingPlant: _, ...rest } = p; return rest; }
    return p;
  });
}
