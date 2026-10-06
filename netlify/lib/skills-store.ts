import { z } from "zod";
import { CUSTOM_SKILL_ID, SKILL_LIMITS, cleanSkillText, type SkillsState, type SkillsStorage, type UserSkill } from "../../src/lib/skills.js";
import { isSecureRequest, parseCookies, serializeCookie } from "./cookies.js";
import { seal, unseal } from "./crypto.js";
import { db } from "./db.js";
import { sessionSecret } from "./env.js";
import { HttpError } from "./http.js";
import { log } from "./log.js";
import { SESSION_TTL, SKILLS_COOKIE, type SessionData } from "./session.js";

/**
 * Per-account skills (custom skills + which skills are on).
 *  - database: users.skills JSONB (synced across devices).
 *  - session:  sealed HTTP-only cookie, bound to the GitHub user — used when there's no database.
 */

const COOKIE_LIMIT = 3800;

const skillSchema = z
  .object({
    id: z.string().regex(CUSTOM_SKILL_ID),
    name: z.string().trim().min(1, "Give the skill a name.").max(SKILL_LIMITS.name),
    description: z.string().max(SKILL_LIMITS.description).default(""),
    instructions: z.string().trim().min(1, "Write the skill's instructions.").max(SKILL_LIMITS.instructions),
    createdAt: z.string().max(40).optional(),
    updatedAt: z.string().max(40).optional(),
  })
  .strict();

export const skillsStateSchema = z
  .object({
    custom: z.array(skillSchema).max(SKILL_LIMITS.maxCustom, `You can have up to ${SKILL_LIMITS.maxCustom} custom skills.`),
    enabled: z.array(z.string().max(60)).max(SKILL_LIMITS.maxCustom + 20).nullable(),
  })
  .strict();

const empty = (): SkillsState => ({ custom: [], enabled: null });

/** Normalise anything stored (or sent) into a clean state. Invalid entries are dropped. */
export function sanitizeSkills(raw: unknown, prev?: SkillsState): SkillsState {
  const parsed = skillsStateSchema.safeParse(raw);
  if (!parsed.success) return empty();
  const now = new Date().toISOString();
  const before = new Map((prev?.custom ?? []).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const custom: UserSkill[] = [];
  for (const s of parsed.data.custom) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    const old = before.get(s.id);
    const next = {
      id: s.id,
      name: cleanSkillText(s.name, SKILL_LIMITS.name),
      description: cleanSkillText(s.description, SKILL_LIMITS.description),
      instructions: cleanSkillText(s.instructions, SKILL_LIMITS.instructions),
    };
    const changed = !old || old.name !== next.name || old.description !== next.description || old.instructions !== next.instructions;
    custom.push({ ...next, createdAt: old?.createdAt ?? s.createdAt ?? now, updatedAt: changed && prev ? now : (old?.updatedAt ?? s.updatedAt ?? now) });
  }
  return { custom, enabled: parsed.data.enabled ? [...new Set(parsed.data.enabled)] : null };
}

export interface SkillsStore {
  mode: SkillsStorage;
  load(): Promise<SkillsState>;
  /** Returns Set-Cookie headers to attach (session mode). */
  save(next: SkillsState): Promise<string[]>;
}

type Sql = NonNullable<ReturnType<typeof db>>;
let columnReady: Promise<void> | null = null;
function ensureColumn(sql: Sql): Promise<void> {
  columnReady ??= Promise.resolve(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS skills JSONB`).then(
    () => undefined,
    (err: unknown) => {
      columnReady = null;
      throw err;
    },
  );
  return columnReady;
}

function dbStore(sql: Sql, session: SessionData): SkillsStore {
  const u = session.user;
  return {
    mode: "database",
    async load() {
      await ensureColumn(sql);
      const rows = (await sql`SELECT skills FROM users WHERE github_id = ${u.id}`) as { skills: unknown }[];
      return rows[0]?.skills ? sanitizeSkills(rows[0].skills) : empty();
    },
    async save(next) {
      await ensureColumn(sql);
      await sql`
        INSERT INTO users (github_id, login, name, avatar_url, skills)
        VALUES (${u.id}, ${u.login}, ${u.name}, ${u.avatarUrl}, ${JSON.stringify(next)})
        ON CONFLICT (github_id) DO UPDATE SET skills = EXCLUDED.skills`;
      return [];
    },
  };
}

function cookieStore(req: Request, session: SessionData, secret: string): SkillsStore {
  const purpose = `skills:${session.user.id}`;
  return {
    mode: "session",
    async load() {
      const raw = parseCookies(req.headers.get("cookie"))[SKILLS_COOKIE];
      const data = await unseal<SkillsState>(raw, secret, purpose);
      return data ? sanitizeSkills(data) : empty();
    },
    async save(next) {
      const ttl = Math.max(60, Math.min(SESSION_TTL, session.exp - Math.floor(Date.now() / 1000)));
      const value = await seal(next, secret, purpose, ttl);
      if (value.length > COOKIE_LIMIT) {
        throw new HttpError(409, "SKILLS_LIMIT", "Without a database, skills are kept in a small cookie and this one doesn't fit. Shorten or delete a skill.");
      }
      return [serializeCookie(SKILLS_COOKIE, value, { maxAge: ttl, path: "/api", secure: isSecureRequest(req), sameSite: "Strict" })];
    },
  };
}

export function skillsStore(req: Request, session: SessionData): SkillsStore {
  const sql = db();
  if (sql) return dbStore(sql, session);
  const secret = sessionSecret();
  if (!secret) throw new HttpError(503, "BACKEND_UNAVAILABLE", "Skills storage isn't configured on the server.");
  return cookieStore(req, session, secret);
}

/** For the agent: never fail a chat because skills couldn't be read. */
export async function loadSkillsSafe(req: Request, session: SessionData): Promise<SkillsState> {
  try {
    return await skillsStore(req, session).load();
  } catch (err) {
    log("warn", "skills load failed", { error: err instanceof Error ? err.message : "unknown" });
    return empty();
  }
}
