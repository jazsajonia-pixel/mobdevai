import "@testing-library/jest-dom/vitest";

// jsdom gaps that CodeMirror and responsive hooks touch.
if (typeof window !== "undefined") {
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON() {} }) as DOMRect;
  const list = () => Object.assign([], { item: () => null }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect ??= rect;
  Range.prototype.getClientRects ??= list;
  Element.prototype.scrollIntoView ??= function () {};
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  beforeEach(() => window.localStorage.clear());
}
