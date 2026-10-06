/**
 * Skills: reusable guidance added to the agent's system prompt.
 *  - Built-in skills ship with the app.
 *  - Custom skills are written by the user and synced to their account (/api/skills).
 * Pure module — shared by the client and the server functions.
 */

export interface Skill {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

export interface UserSkill extends Skill {
  createdAt: string;
  updatedAt: string;
}

export const BUILTIN_SKILLS: Skill[] = [
  { id: "code-review", name: "Code review", description: "Look for bugs, regressions, and maintainability risks.", instructions: "Review changes like a senior engineer: prioritize correctness, security, regressions, and actionable fixes." },
  { id: "debugging", name: "Debugging", description: "Investigate failures methodically before editing.", instructions: "Debug from evidence: reproduce or inspect the failing path, identify the smallest root cause, then propose a focused fix." },
  { id: "accessibility", name: "Accessibility", description: "Keep UI usable with keyboard, touch, and assistive technology.", instructions: "Check semantic HTML, labels, focus order, keyboard behavior, contrast, and touch target sizes whenever UI is involved." },
  { id: "mobile-ui", name: "Mobile UI", description: "Optimize layouts and interactions for small screens.", instructions: "Favor responsive layouts, readable density, one-handed touch targets, safe-area spacing, and progressive disclosure on phones." },
];

/** @deprecated use BUILTIN_SKILLS */
export const CUSTOM_SKILLS = BUILTIN_SKILLS;

export const SKILL_LIMITS = { maxCustom: 20, name: 60, description: 160, instructions: 2000 } as const;
export const CUSTOM_SKILL_ID = /^u_[a-z0-9]{6,24}$/;

export type SkillsStorage = "database" | "session";

/** What the server stores per user. `enabled: null` means "never chosen" → all built-ins on. */
export interface SkillsState {
  custom: UserSkill[];
  enabled: string[] | null;
}

export interface SkillsResponse {
  custom: UserSkill[];
  enabled: string[];
  storage: SkillsStorage;
}

export const defaultEnabled = (): string[] => BUILTIN_SKILLS.map((s) => s.id);

/** Drops unknown ids and duplicates; resolves the default. */
export function effectiveEnabled(state: SkillsState): string[] {
  if (state.enabled === null) return [...defaultEnabled(), ...state.custom.map((s) => s.id)];
  const known = new Set([...BUILTIN_SKILLS.map((s) => s.id), ...state.custom.map((s) => s.id)]);
  return [...new Set(state.enabled.filter((id) => known.has(id)))];
}

/** Skills (built-in + custom) whose ids are in `ids`, in display order. */
export function resolveSkills(ids: readonly string[], custom: readonly Skill[]): Skill[] {
  const set = new Set(ids);
  return [...BUILTIN_SKILLS, ...custom].filter((s) => set.has(s.id));
}

export function newSkillId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `u_${[...bytes].map((b) => (b % 36).toString(36)).join("")}`;
}

/** Strip control characters (keep newlines/tabs) and trim. */
export function cleanSkillText(s: string, max: number): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);
}
