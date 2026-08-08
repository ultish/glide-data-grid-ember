// Plain-DOM port of `packages/core/src/internal/markdown-div/markdown-div.tsx` +
// `private/markdown-container.tsx` (Phase 4b) -- renders markdown to HTML via the `marked` npm
// package and forces every `<a>` tag it produces to open in a new tab. Confirms PORTING-NOTES.md's
// Phase 4 research finding: no ProseMirror anywhere in source, this is the whole implementation.
//
// NOT an Ember component (same rationale as `growing-entry.ts`'s header comment -- the markdown-
// cell overlay editor that calls this is plain imperative DOM code with no Ember rendering context
// available). Source's version is a `React.PureComponent` that re-renders into a persistent ref'd
// container on every prop change; this port is instead a one-shot factory that builds a fresh
// container from `contents` -- the only caller (`markdown-cell.ts`'s preview/edit toggle) never
// needs to update an already-mounted preview in place, it tears down and rebuilds the whole editor
// DOM when swapping between preview/edit modes, so there is no update path to port.
import { marked } from "marked";

export function createMarkdownDiv(contents: string, createNode?: (content: string) => DocumentFragment): HTMLDivElement {
    const container = document.createElement("div");
    // Source's `MarkdownContainer` (`markdown-container.tsx`), ported rule-for-rule as
    // `.gdg-markdown-div` in `components/glide-data-grid-editors.css`. That includes the three
    // descendant rules source has (`> * { margin: 0 }`, `*:last-child { margin-bottom: 0 }`,
    // `p img { width: 100% }`), which this file used to apply by walking the rendered nodes after
    // every render -- as CSS they simply hold for whatever `marked` produces.
    container.className = "gdg-markdown-div";

    const innerHTML: string = marked(contents, { async: false });

    let newChild: DocumentFragment | undefined = createNode?.(innerHTML);
    if (newChild === undefined) {
        const template = document.createElement("template");
        template.innerHTML = innerHTML;
        newChild = template.content;
    }
    container.append(newChild);

    const tags = container.getElementsByTagName("a");
    for (const tag of tags) {
        tag.target = "_blank";
        tag.rel = "noreferrer noopener";
    }

    return container;
}
