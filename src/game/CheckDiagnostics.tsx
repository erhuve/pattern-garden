import type { CheckResult } from "./types";

export function CheckDiagnostics({ check }: { check: CheckResult }) {
  const marks = [...new Map((check.marks ?? []).filter(m => m.label && m.tone === "bad").map(m => [`${m.cell.x},${m.cell.y}:${m.label}`, m])).values()];
  if (!marks.length) return null;
  return <details className="pg-tile-reasons" open>
    <summary>Tiles needing attention</summary>
    <ul>{marks.map(({ cell, label }) => <li key={`${cell.x},${cell.y}:${label}`}>Column {cell.x + 1}, row {cell.y + 1}: {label}</li>)}</ul>
  </details>;
}
