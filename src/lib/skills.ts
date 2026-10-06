import { safeStorage } from "./storage.js";
export interface CustomSkill { id: string; name: string; description: string; instructions: string }
export const CUSTOM_SKILLS: CustomSkill[] = [
  { id: "code-review", name: "Code review", description: "Look for bugs, regressions, and maintainability risks.", instructions: "Review changes like a senior engineer: prioritize correctness, security, regressions, and actionable fixes." },
  { id: "debugging", name: "Debugging", description: "Investigate failures methodically before editing.", instructions: "Debug from evidence: reproduce or inspect the failing path, identify the smallest root cause, then propose a focused fix." },
  { id: "accessibility", name: "Accessibility", description: "Keep UI usable with keyboard, touch, and assistive technology.", instructions: "Check semantic HTML, labels, focus order, keyboard behavior, contrast, and touch target sizes whenever UI is involved." },
  { id: "mobile-ui", name: "Mobile UI", description: "Optimize layouts and interactions for small screens.", instructions: "Favor responsive layouts, readable density, one-handed touch targets, safe-area spacing, and progressive disclosure on phones." },
];
const KEY = "chrono:enabled-skills:v1";
export function loadEnabledSkills(): string[] { const raw = safeStorage.get(KEY); if (!raw) return CUSTOM_SKILLS.map((s) => s.id); try { const ids = JSON.parse(raw) as unknown; return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && CUSTOM_SKILLS.some((s) => s.id === id)) : CUSTOM_SKILLS.map((s) => s.id); } catch { return CUSTOM_SKILLS.map((s) => s.id); } }
export function saveEnabledSkills(ids: string[]): void { safeStorage.trySet(KEY, JSON.stringify(ids.filter((id) => CUSTOM_SKILLS.some((s) => s.id === id)))); }
