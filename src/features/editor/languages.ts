import type { Extension } from "@codemirror/state";

/**
 * Syntax support, loaded on demand so the initial bundle stays small on mobile networks.
 * Unknown extensions fall back to plain text.
 */
export async function loadLanguage(path: string): Promise<Extension | null> {
  const name = path.split("/").pop()?.toLowerCase() ?? "";
  const ext = name.includes(".") ? name.split(".").pop()! : name;
  switch (ext) {
    case "js":
    case "mjs":
    case "cjs":
      return (await import("@codemirror/lang-javascript")).javascript();
    case "jsx":
      return (await import("@codemirror/lang-javascript")).javascript({ jsx: true });
    case "ts":
    case "mts":
    case "cts":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true });
    case "tsx":
      return (await import("@codemirror/lang-javascript")).javascript({ typescript: true, jsx: true });
    case "html":
    case "htm":
    case "svg":
    case "vue":
      return (await import("@codemirror/lang-html")).html();
    case "css":
    case "scss":
    case "less":
      return (await import("@codemirror/lang-css")).css();
    case "json":
    case "jsonc":
    case "webmanifest":
      return (await import("@codemirror/lang-json")).json();
    case "md":
    case "mdx":
    case "markdown":
      return (await import("@codemirror/lang-markdown")).markdown();
    case "py":
      return (await import("@codemirror/lang-python")).python();
    case "yml":
    case "yaml": {
      const [{ StreamLanguage }, { yaml }] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/yaml")]);
      return StreamLanguage.define(yaml);
    }
    case "sh":
    case "bash":
    case "zsh":
    case "env": {
      const [{ StreamLanguage }, { shell }] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/shell")]);
      return StreamLanguage.define(shell);
    }
    case "toml": {
      const [{ StreamLanguage }, { toml }] = await Promise.all([import("@codemirror/language"), import("@codemirror/legacy-modes/mode/toml")]);
      return StreamLanguage.define(toml);
    }
    default:
      return null;
  }
}
