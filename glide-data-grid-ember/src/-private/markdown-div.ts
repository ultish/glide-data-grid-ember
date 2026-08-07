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
    // Source's `MarkdownContainer` (`@linaria/react` styled-component, not ported as CSS-in-JS --
    // this port has no CSS-in-JS pipeline, see PORTING-NOTES.md's Phase 4a precedent of inline
    // styles for all overlay-editor DOM). Values copied verbatim from `markdown-container.tsx`.
    Object.assign(container.style, {
        wordBreak: "break-word",
        paddingTop: "6px",
    } satisfies Partial<CSSStyleDeclaration>);

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

    // Remaining rules from source's `MarkdownContainer` styled-component (`> * { margin: 0 }`,
    // `*:last-child { margin-bottom: 0 }`, `p img { width: 100% }`) -- applied directly as inline
    // styles on the rendered nodes since this port has no CSS-in-JS pipeline to reach for.
    for (const child of container.children) {
        (child as HTMLElement).style.margin = "0";
    }
    const last = container.lastElementChild;
    if (last !== null) (last as HTMLElement).style.marginBottom = "0";
    for (const img of container.querySelectorAll("p img")) {
        (img as HTMLElement).style.width = "100%";
    }

    return container;
}
