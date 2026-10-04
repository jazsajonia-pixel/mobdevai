import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { bracketMatching, indentOnInput } from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { editorTheme, syntaxTheme } from "./theme";
import { loadLanguage } from "./languages";
import type { EditorStateCache } from "./state-cache";

export interface CodeEditorHandle {
  view: () => EditorView | null;
  undo: () => void;
  redo: () => void;
  insert: (text: string) => void;
  gotoLine: (line: number) => void;
  focus: () => void;
  getDoc: () => string;
}

export interface HistoryInfo {
  canUndo: boolean;
  canRedo: boolean;
}

const languageSlot = new Compartment();
const wrapSlot = new Compartment();
const readOnlySlot = new Compartment();

/** Our own find bar drives @codemirror/search; this invisible panel keeps match highlighting on. */
const hiddenSearchPanel = () => {
  const dom = document.createElement("div");
  dom.hidden = true;
  return { dom, top: true };
};

function baseExtensions(wrap: boolean, readOnly: boolean, callbacks: { current: Callbacks }): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightSpecialChars(),
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    closeBrackets(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    search({ createPanel: hiddenSearchPanel }),
    keymap.of([
      { key: "Mod-s", preventDefault: true, run: () => (callbacks.current.onSave(), true) },
      { key: "Mod-f", preventDefault: true, run: () => (callbacks.current.onFind(), true) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap.filter((k) => k.key !== "Mod-f"),
      indentWithTab,
    ]),
    EditorState.tabSize.of(2),
    editorTheme,
    syntaxTheme,
    languageSlot.of([]),
    wrapSlot.of(wrap ? EditorView.lineWrapping : []),
    readOnlySlot.of(EditorState.readOnly.of(readOnly)),
    EditorView.contentAttributes.of({ autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Code editor" }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) callbacks.current.onChange(u.state.doc.toString());
      if (u.docChanged || u.transactions.length) {
        callbacks.current.onHistory({ canUndo: undoDepth(u.state) > 0, canRedo: redoDepth(u.state) > 0 });
      }
      if (u.focusChanged) callbacks.current.onFocus(u.view.hasFocus);
    }),
  ];
}

interface Callbacks {
  onChange: (doc: string) => void;
  onHistory: (h: HistoryInfo) => void;
  onFocus: (focused: boolean) => void;
  onSave: () => void;
  onFind: () => void;
}

/**
 * CodeMirror 6 — chosen over Monaco because it works with mobile keyboards, selection handles
 * and IME. One EditorView is reused; each file keeps its own EditorState (and undo history) in
 * `states`, so switching tabs never loses history.
 */
export const CodeEditor = forwardRef<
  CodeEditorHandle,
  {
    path: string;
    /** Content used when no cached state exists for `path`. */
    doc: string;
    states: EditorStateCache;
    wrap: boolean;
    readOnly?: boolean;
    onChange: (doc: string) => void;
    onHistory: (h: HistoryInfo) => void;
    onFocusChange?: (focused: boolean) => void;
    onSave: () => void;
    onFind: () => void;
  }
>(function CodeEditor({ path, doc, states, wrap, readOnly = false, onChange, onHistory, onFocusChange, onSave, onFind }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const pathRef = useRef<string | null>(null);
  const epochRef = useRef(0);
  const callbacks = useRef<Callbacks>({ onChange, onHistory, onFocus: () => {}, onSave, onFind });
  callbacks.current = { onChange, onHistory, onFocus: onFocusChange ?? (() => {}), onSave, onFind };
  const wrapRef = useRef(wrap);
  wrapRef.current = wrap;
  const roRef = useRef(readOnly);
  roRef.current = readOnly;

  // Create the view once.
  useEffect(() => {
    const view = new EditorView({ parent: host.current! });
    viewRef.current = view;
    return () => {
      if (pathRef.current) states.set(pathRef.current, view.state, epochRef.current);
      view.destroy();
      viewRef.current = null;
      pathRef.current = null;
      document.documentElement.classList.remove("editor-focused");
    };
  }, [states]);

  // Swap state when the file changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (pathRef.current && pathRef.current !== path) states.set(pathRef.current, view.state, epochRef.current);
    let state = states.get(path);
    if (!state) state = EditorState.create({ doc, extensions: baseExtensions(wrapRef.current, roRef.current, callbacks) });
    view.setState(state);
    pathRef.current = path;
    epochRef.current = states.epoch(path);
    view.dispatch({
      effects: [wrapSlot.reconfigure(wrapRef.current ? EditorView.lineWrapping : []), readOnlySlot.reconfigure(EditorState.readOnly.of(roRef.current))],
    });
    callbacks.current.onHistory({ canUndo: undoDepth(view.state) > 0, canRedo: redoDepth(view.state) > 0 });
    let cancelled = false;
    loadLanguage(path).then(
      (lang) => {
        if (!cancelled && lang && pathRef.current === path && viewRef.current) viewRef.current.dispatch({ effects: languageSlot.reconfigure(lang) });
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
    // `doc` intentionally excluded: it only seeds a brand-new state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, states]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: wrapSlot.reconfigure(wrap ? EditorView.lineWrapping : []) });
  }, [wrap]);

  useEffect(() => {
    viewRef.current?.dispatch({ effects: readOnlySlot.reconfigure(EditorState.readOnly.of(readOnly)) });
  }, [readOnly]);

  useImperativeHandle(
    ref,
    () => ({
      view: () => viewRef.current,
      undo: () => {
        const v = viewRef.current;
        if (v) undo(v);
      },
      redo: () => {
        const v = viewRef.current;
        if (v) redo(v);
      },
      insert: (text) => {
        const v = viewRef.current;
        if (!v) return;
        v.dispatch(v.state.replaceSelection(text), { scrollIntoView: true, userEvent: "input.type" });
        v.focus();
      },
      gotoLine: (line) => {
        const v = viewRef.current;
        if (!v) return;
        const l = v.state.doc.line(Math.max(1, Math.min(line, v.state.doc.lines)));
        v.dispatch({ selection: { anchor: l.from, head: l.to }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
      },
      focus: () => viewRef.current?.focus(),
      getDoc: () => viewRef.current?.state.doc.toString() ?? "",
    }),
    [],
  );

  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />;
});
