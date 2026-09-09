import type { Evaluation, Layout } from "./types";
import { gardenSunny, sceneEndpoints, sceneReserved } from "./scene-terrain";
import "./scene-overlay.css";

const iso = (x: number, y: number) => ({ x: (x - y) * 30, y: (x + y) * 15 });
const tile = (x: number, y: number) => [[x, y], [x + 1, y], [x + 1, y + 1], [x, y + 1]].map(([a, b]) => { const p = iso(a, b); return `${p.x},${p.y}`; }).join(" ");

export function SceneGround({ layout, x, y, showLight }: { layout: Layout; x: number; y: number; showLight: boolean }) {
  if (!layout.scene) return null;
  const reserved = sceneReserved(layout, { x, y });
  const inside = x >= layout.room.x && x < layout.room.x + layout.room.w && y >= layout.room.y && y < layout.room.y + layout.room.h;
  const lamp = layout.scene === "eating-atmosphere" && layout.pieces.some(p => p.kind === "table" && p.lamp && Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) <= 1);
  const c = iso(x + 0.5, y + 0.5);
  return <g pointerEvents="none" aria-hidden="true">
    {reserved && <><polygon points={tile(x, y)} className="pg-promenade" data-scene-paving={`${x},${y}`} /><path d={`M${c.x - 7},${c.y - 3.5}l14,7`} className="pg-paving-joint" /></>}
    {layout.scene === "garden-seat" && showLight && !reserved && <polygon points={tile(x, y)} className={gardenSunny(layout, { x, y }) ? "pg-afternoon-sun" : "pg-afternoon-shade"} data-sun-cell={`${x},${y}`} data-sunny={gardenSunny(layout, { x, y })} />}
    {layout.scene === "eating-atmosphere" && inside && <polygon points={tile(x, y)} className={lamp ? "pg-supper-light" : "pg-supper-dim"} data-lamp-pool={lamp ? `${x},${y}` : undefined} />}
  </g>;
}

export function SceneOverlay({ layout, evaluation, highlightedCheck }: { layout: Layout; evaluation: Evaluation; highlightedCheck?: string }) {
  if (!layout.scene) return null;
  const promenade = layout.scene === "overlooking-life" || layout.scene === "garden-seat";
  const labels = promenade ? [{ x: (layout.world.w - 1) / 2, y: layout.world.h - 0.15, label: "PUBLIC GARDEN WALK" }] : sceneEndpoints(layout).map((c, i) => ({ ...c, label: i ? "GARDEN" : "ENTRY" }));
  const marks = evaluation.checks.find(c => c.id === highlightedCheck)?.marks ?? [];
  const unique = [...new Map([...marks].sort((a,b) => Number(a.tone === "bad") - Number(b.tone === "bad")).map(m => [`${m.cell.x},${m.cell.y}`, m])).values()];
  return <g pointerEvents="none" aria-hidden="true" className="pg-scene-overlay">
    {promenade && [1, 4, 7].filter(x => x < layout.world.w).map((x, i) => {
      const p = iso(x + 0.5, layout.world.h - 0.5);
      return <g key={x} transform={`translate(${p.x},${p.y})`} className="pg-passerby">
        <ellipse rx="5" ry="2.3" className="pg-passerby-shadow" />
        <path d="M-2-8-3 0M2-8 3-1" className="pg-passerby-legs" />
        <path d="M-3-15Q0-18 3-15L4-6H-4Z" fill={i === 1 ? "#987252" : "#587663"} />
        <circle cy="-20" r="3.5" fill="#d6b998" />
      </g>;
    })}
    {labels.map(({x,y,label}) => { const p=iso(x + 0.5, y + 0.5); return <text key={label} x={p.x} y={p.y + 10} className="pg-scene-label">{label}</text>; })}
    <g data-diagnostic-check={highlightedCheck}>
      {unique.map(({cell,tone,label}) => {
        const p=iso(cell.x + 0.5, cell.y + 0.5);
        return <g key={`${cell.x},${cell.y}`} data-diagnostic-cell={`${cell.x},${cell.y}`} data-tone={tone}>
          <polygon points={tile(cell.x, cell.y)} className={`pg-diagnostic is-${tone}`} />
          {label && <><circle cx={p.x} cy={p.y - 4} r="5.5" className={`pg-diagnostic-dot is-${tone}`} /><text x={p.x} y={p.y - 1} className="pg-diagnostic-symbol">{tone === "bad" ? "!" : tone === "good" ? "✓" : "·"}</text></>}
          <title>{label ?? tone}</title>
        </g>;
      })}
    </g>
  </g>;
}
