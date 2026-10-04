import type { BuildResult } from "./bundler";
import { PREVIEW_SANDBOX } from "./runtime";
import { locate } from "./use-preview";

export interface ProbeReport {
  booted: boolean;
  errors: { message: string; where: string | null }[];
  console: { level: string; text: string }[];
}

/**
 * Runs a built preview in a hidden, sandboxed frame for a few seconds and collects runtime errors
 * and console warnings/errors — used by the agent's `request_preview` tool. Same isolation as the
 * visible preview (opaque origin; messages accepted only from this frame with this nonce).
 */
export function probePreview(result: BuildResult, opts: { timeoutMs?: number; settleMs?: number } = {}): Promise<ProbeReport> {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const settleMs = opts.settleMs ?? 1200;
  return new Promise((resolve) => {
    const report: ProbeReport = { booted: false, errors: [], console: [] };
    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", PREVIEW_SANDBOX);
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:fixed;left:-10000px;top:0;width:390px;height:800px;border:0;visibility:hidden;pointer-events:none";
    let settle: ReturnType<typeof setTimeout> | undefined;
    const done = () => {
      clearTimeout(settle);
      clearTimeout(hard);
      window.removeEventListener("message", onMessage);
      frame.remove();
      resolve(report);
    };
    const str = (v: unknown, n = 2000) => (typeof v === "string" ? v.slice(0, n) : "");
    const onMessage = (e: MessageEvent) => {
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object" || d.__mdai !== result.nonce || e.source !== frame.contentWindow) return;
      if (d.type === "ready") {
        report.booted = true;
        settle = setTimeout(done, settleMs);
      } else if (d.type === "error" && report.errors.length < 10) {
        const loc = locate(str(d.stack, 4000), result.sources);
        report.errors.push({ message: str(d.message), where: loc.file ? `${loc.file}${loc.line ? `:${loc.line}` : ""}` : null });
      } else if (d.type === "console" && (d.level === "warn" || d.level === "error") && report.console.length < 20) {
        report.console.push({ level: d.level, text: str(d.text, 500) });
      }
    };
    const hard = setTimeout(done, timeoutMs);
    window.addEventListener("message", onMessage);
    frame.srcdoc = result.html;
    document.body.appendChild(frame);
  });
}
