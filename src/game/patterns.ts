import data from "@/data/apl.json";

export type Section = "towns" | "buildings" | "construction";

export type PatternRef = {
  number: number;
  title: string;
  section: Section;
  subsection: string;
  stars: number;
};

export const PATTERNS: PatternRef[] = (data.patterns as PatternRef[]).slice().sort((a, b) => a.number - b.number);

export const LINKS: [number, number][] = data.edges as [number, number][];

export const SECTION_LABEL: Record<Section, string> = {
  towns: "Towns",
  buildings: "Buildings",
  construction: "Construction",
};

export function patternByNumber(n: number): PatternRef | undefined {
  return PATTERNS.find((p) => p.number === n);
}
