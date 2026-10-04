/** Build phases from the product plan — shown on Home so the product status is never ambiguous. */
export type PhaseStatus = "done" | "next" | "planned";

export const PHASES: readonly { n: number; title: string; status: PhaseStatus }[] = [
  { n: 0, title: "Foundation", status: "done" },
  { n: 1, title: "Auth + GitHub", status: "done" },
  { n: 2, title: "Mobile editor", status: "done" },
  { n: 3, title: "AI providers", status: "done" },
  { n: 4, title: "AI coding agent", status: "done" },
  { n: 5, title: "Live preview", status: "done" },
  { n: 6, title: "Git shipping", status: "done" },
  { n: 7, title: "Polish", status: "done" },
  { n: 8, title: "Production", status: "next" },
];
