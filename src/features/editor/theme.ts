import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

/** Editor chrome + syntax colours from CSS variables so light/dark follow the app theme. */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "14px",
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
  },
  ".cm-scroller": {
    fontFamily: "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
    lineHeight: "1.65",
    overscrollBehavior: "contain",
  },
  ".cm-content": { padding: "8px 0 40vh", caretColor: "hsl(var(--primary))" },
  ".cm-line": { padding: "0 12px 0 6px" },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--muted-foreground) / 0.55)",
    border: "none",
    borderRight: "1px solid hsl(var(--border) / 0.6)",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px 0 10px", minWidth: "36px" },
  ".cm-activeLine": { backgroundColor: "hsl(var(--surface-2) / 0.55)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "hsl(var(--foreground))" },
  "&.cm-focused": { outline: "none" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "hsl(var(--primary))", borderLeftWidth: "2px" },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "hsl(var(--primary) / 0.28) !important",
  },
  ".cm-searchMatch": { backgroundColor: "hsl(var(--warning) / 0.25)", outline: "1px solid hsl(var(--warning) / 0.5)", borderRadius: "2px" },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: "hsl(var(--primary) / 0.4)", outlineColor: "hsl(var(--primary))" },
  ".cm-selectionMatch": { backgroundColor: "hsl(var(--primary) / 0.14)" },
  ".cm-matchingBracket": { backgroundColor: "hsl(var(--primary) / 0.2)", outline: "1px solid hsl(var(--primary) / 0.5)" },
  ".cm-foldPlaceholder": { backgroundColor: "hsl(var(--surface-2))", border: "none", color: "hsl(var(--muted-foreground))" },
  ".cm-tooltip": { backgroundColor: "hsl(var(--surface))", border: "1px solid hsl(var(--border))", borderRadius: "8px" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "hsl(var(--primary) / 0.2)", color: "hsl(var(--foreground))" },
  ".cm-panels": { display: "none" },
});

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword], color: "hsl(var(--syn-keyword))" },
  { tag: [t.string, t.special(t.string), t.regexp], color: "hsl(var(--syn-string))" },
  { tag: [t.number, t.bool, t.null, t.atom], color: "hsl(var(--syn-number))" },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: "hsl(var(--syn-comment))", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "hsl(var(--syn-fn))" },
  { tag: [t.typeName, t.className, t.namespace], color: "hsl(var(--syn-type))" },
  { tag: [t.tagName, t.heading], color: "hsl(var(--syn-tag))", fontWeight: "500" },
  { tag: [t.attributeName, t.propertyName, t.labelName], color: "hsl(var(--syn-attr))" },
  { tag: [t.operator, t.punctuation, t.bracket], color: "hsl(var(--muted-foreground))" },
  { tag: [t.link, t.url], color: "hsl(var(--syn-fn))", textDecoration: "underline" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.invalid, color: "hsl(var(--danger))" },
]);

export const syntaxTheme = syntaxHighlighting(highlight);
