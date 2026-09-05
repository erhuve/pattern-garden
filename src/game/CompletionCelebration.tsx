import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import "./completion-celebration.css";

const DURATION_MS = 3600;
const petals = Array.from({ length: 18 }, (_, i) => {
  const angle = (i / 18) * Math.PI * 2;
  return {
    left: `${50 + Math.cos(angle) * (35 + (i % 3) * 4)}%`,
    top: `${50 + Math.sin(angle) * (33 + (i % 2) * 8)}%`,
    "--drift-x": `${Math.cos(angle) * 32}px`,
    "--drift-y": `${Math.sin(angle) * 38 - 14}px`,
    "--turn": `${i * 37}deg`,
    "--delay": `${80 + (i % 5) * 55}ms`,
  } as CSSProperties;
});

export function CompletionCelebration({ complete }: { complete: boolean }) {
  const wasComplete = useRef(complete);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const justCompleted = complete && !wasComplete.current;
    wasComplete.current = complete;
    if (!complete) {
      setVisible(false);
      return;
    }
    if (!justCompleted) return;
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [complete]);

  if (!complete || !visible) return null;

  return (
    <div className="pg-celebration" aria-hidden="true" style={{ "--celebration-duration": `${DURATION_MS}ms` } as CSSProperties}>
      <div className="pg-celebration-glow" />
      <div className="pg-celebration-rings"><i /><i /></div>
      <div className="pg-celebration-petals">
        {petals.map((style, i) => <i key={i} style={style} />)}
      </div>
      <div className="pg-celebration-banner">
        <span className="pg-celebration-mark"><Check strokeWidth={2.4} /></span>
        <div>
          <p className="pg-celebration-label">100% · pattern fulfilled</p>
          <p className="pg-celebration-title">The pattern is alive.</p>
          <p className="pg-celebration-caption">All criteria met.</p>
        </div>
      </div>
    </div>
  );
}
