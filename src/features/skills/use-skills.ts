import { useState } from "react";
import { loadEnabledSkills, saveEnabledSkills } from "@/lib/skills";
export function useSkills() {
  const [enabled, setEnabled] = useState<string[]>(loadEnabledSkills);
  function toggle(id: string) { setEnabled((current) => { const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id]; saveEnabledSkills(next); return next; }); }
  return { enabled, toggle };
}
