/** Plain-text / regex search across workspace file contents. Pure, so it's easy to test. */

export interface SearchOptions {
  caseSensitive: boolean;
  regexp: boolean;
}

export interface LineMatch {
  line: number;
  text: string;
  /** Match range within `text`. */
  start: number;
  end: number;
}

export interface FileMatches {
  path: string;
  matches: LineMatch[];
}

export function buildMatcher(query: string, opts: SearchOptions): RegExp | null {
  if (!query) return null;
  const flags = opts.caseSensitive ? "g" : "gi";
  try {
    return new RegExp(opts.regexp ? query : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), flags);
  } catch {
    return null;
  }
}

const MAX_PER_FILE = 50;
const MAX_LINE = 240;

export function searchContent(path: string, content: string, re: RegExp): FileMatches | null {
  const matches: LineMatch[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length && matches.length < MAX_PER_FILE; i++) {
    const line = lines[i]!;
    re.lastIndex = 0;
    const m = re.exec(line);
    if (!m || m[0].length === 0) continue;
    // Trim long lines around the match so results stay readable on a phone.
    let start = 0;
    if (line.length > MAX_LINE && m.index > 40) start = m.index - 40;
    const text = line.slice(start, start + MAX_LINE);
    matches.push({ line: i + 1, text, start: m.index - start, end: Math.min(m.index - start + m[0].length, text.length) });
  }
  return matches.length ? { path, matches } : null;
}
