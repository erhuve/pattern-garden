import { Link } from "react-router-dom";
import { ArrowRight, Check, Lock } from "lucide-react";
import { LEVELS } from "@/game/levels";
import { PATTERNS, SECTION_LABEL } from "@/game/patterns";
import { useProgress } from "@/game/progress";

export default function Home() {
  const progress = useProgress();
  const done = LEVELS.filter((l) => (progress.best[l.slug] ?? 0) >= 100).length;
  const playable = new Set(LEVELS.map((l) => l.number));
  const byKey = new Map(LEVELS.map((l) => [l.number, l]));

  return (
    <main className="pg-home">
      <header className="pg-hero">
        <p className="pg-eyebrow">a game of places, after Christopher Alexander</p>
        <h1>Pattern Garden</h1>
        <p className="pg-lede">
          Each level is one pattern from <em>A Pattern Language</em>. You are given a small room or garden and a
          handful of pieces. Arrange them until the pattern is fully alive — and watch who comes to sit.
        </p>
        <div className="pg-hero-row">
          <Link to={`/play/${LEVELS[0].slug}`} className="pg-cta">
            begin with {LEVELS[0].title} <ArrowRight />
          </Link>
          <span className="pg-tally">{done} of {LEVELS.length} patterns fulfilled</span>
        </div>
      </header>

      <section className="pg-levels">
        <h2>Playable now</h2>
        <ol>
          {LEVELS.map((l) => {
            const best = progress.best[l.slug] ?? 0;
            return (
              <li key={l.slug}>
                <Link to={`/play/${l.slug}`} className={`pg-level ${best >= 100 ? "is-done" : ""}`}>
                  <span className="pg-num">{l.number}</span>
                  <div>
                    <b>{l.title}</b>
                    <p>{l.tagline}</p>
                  </div>
                  <span className="pg-best">{best >= 100 ? <Check /> : best > 0 ? `${best}%` : ""}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="pg-language">
        <h2>The whole language</h2>
        <p className="pg-lede small">
          All 253 patterns, in the order the book gives them. Bright ones are playable; the rest are
          waiting to be built.
        </p>
        {(["towns", "buildings", "construction"] as const).map((sec) => (
          <div key={sec} className="pg-section">
            <h3>{SECTION_LABEL[sec]}</h3>
            <div className="pg-grid">
              {PATTERNS.filter((p) => p.section === sec).map((p) => {
                const lvl = byKey.get(p.number);
                const cls = `pg-cell ${playable.has(p.number) ? "is-live" : ""}`;
                return lvl ? (
                  <Link key={p.number} to={`/play/${lvl.slug}`} className={cls} title={p.title}>
                    <span>{p.number}</span>
                    <b>{p.title}</b>
                  </Link>
                ) : (
                  <div key={p.number} className={cls} title={p.title} aria-label={`${p.number} ${p.title} — not yet playable`}>
                    <span>{p.number}</span>
                    <b>{p.title}</b>
                    <Lock />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <footer className="pg-foot">
        Patterns are hypotheses, all 253 of them — Alexander, Ishikawa, Silverstein, 1977.
      </footer>
    </main>
  );
}
