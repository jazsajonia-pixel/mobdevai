/** Build phases from the product plan — shown on Home so the product status is never ambiguous. */
export const PHASES = [
  { n: 0, title: "Foundation", status: "done" },
  { n: 1, title: "Auth + GitHub", status: "done" },
  { n: 2, title: "Mobile editor", status: "done" },
  { n: 3, title: "AI providers", status: "done" },
  { n: 4, title: "AI coding agent", status: "next" },
  { n: 5, title: "Live preview", status: "planned" },
  { n: 6, title: "Git shipping", status: "planned" },
  { n: 7, title: "Polish", status: "planned" },
  { n: 8, title: "Production", status: "planned" },
] as const;
