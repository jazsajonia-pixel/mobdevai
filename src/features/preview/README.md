# features/preview

Live preview (Phase 5). Runs entirely in the browser; repository code never reaches our server.

| File | Role |
| --- | --- |
| `detect.ts` | `analyzeProject(paths, read)` → a build plan (static / vite / cra / html-modules) or an "unsupported" reason |
| `bundler.ts` | `buildPreview()` → one self-contained `srcdoc` HTML; Sucrase transforms, alias/asset/CSS handling, `BuildError` with code frames |
| `runtime.ts` | Loader + bridge injected into the frame (console, errors, storage shims, link interception); `PREVIEW_SANDBOX` flags |
| `use-preview.ts` | React hook: debounced rebuilds on workspace changes, validated postMessage handling, error → `file:line` mapping |
| `preview-panel.tsx` | Toolbar, viewports, console sheet, error cards, full screen, open in new tab |
| `probe.ts` | Hidden sandboxed run used by the agent's `request_preview` tool |

Never add `allow-same-origin` to the sandbox, and never put tokens into asset URLs.
