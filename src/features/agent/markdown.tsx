import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Safe Markdown for model output: raw HTML is NOT rendered (react-markdown escapes it by default,
 * and we don't enable rehype-raw), unsafe URLs (javascript:, data:) are stripped by the default
 * urlTransform, links open in a new tab without referrer, and images are shown as links only.
 */
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener nofollow" className="text-primary underline underline-offset-2">
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <a href={typeof src === "string" ? src : undefined} target="_blank" rel="noreferrer noopener nofollow" className="text-primary underline">
      [image: {alt || "link"}]
    </a>
  ),
  pre: ({ children }) => <pre className="my-2 overflow-x-auto rounded-md border bg-background p-3 font-mono text-[12.5px] leading-relaxed">{children}</pre>,
  code: ({ className, children }) =>
    className ? <code className={className}>{children}</code> : <code className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{children}</code>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  h1: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1 mt-3 text-sm font-semibold">{children}</h4>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border px-2 py-1 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border px-2 py-1 align-top">{children}</td>,
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 pl-3 text-muted-foreground">{children}</blockquote>,
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="min-w-0 max-w-full break-words text-sm leading-relaxed [overflow-wrap:anywhere]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
