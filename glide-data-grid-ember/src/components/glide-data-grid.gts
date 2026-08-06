// Public `<GlideDataGrid>` component -- Phase 2b of the Ember port. Thin reactivity/lifecycle
// wrapper around the plain-TS `GridHostController` (`../-private/grid-host-controller.ts`), which
// owns all the actual canvas/scroll/resize/hover DOM. This component's only jobs are:
//   1. Render the single container `<div>` the controller mounts itself into.
//   2. Construct the controller once the element exists, destroy it when the component is torn
//      down.
//   3. Re-run `scheduleFullRedraw()` whenever any relevant `@arg` changes, using autotracking
//      rather than any manual dependency list.
//   4. Surface the controller's imperative `updateCells` API to the consumer via `@onReady`.
import Component from "@glimmer/component";
import { registerDestructor } from "@ember/destroyable";
import { modifier } from "ember-modifier";
import { GridHostController, type GridHostArgs } from "../-private/grid-host-controller.ts";
import { getCellRenderer as defaultGetCellRenderer } from "../rendering/-temp-text-cell-renderer.ts";
import type { GridColumn, GridCell, Item, Theme, GetCellRendererCallback } from "../rendering/index.ts";

/** Shape handed to `@onReady` once the underlying `GridHostController` exists. */
export interface GlideDataGridApi {
    readonly updateCells: (cells: readonly { cell: Item }[]) => void;
}

export interface GlideDataGridSignature {
    Element: HTMLDivElement;
    Args: {
        columns: readonly GridColumn[];
        getCellContent: (item: Item) => GridCell;
        rows: number;
        rowHeight?: number | ((row: number) => number);
        headerHeight?: number;
        groupHeaderHeight?: number;
        theme?: Partial<Theme>;
        freezeColumns?: number;
        // Not part of the original Phase 2 brief's enumerated arg list, but required because
        // `GridHostArgs.getCellRenderer` is non-optional -- see PORTING-NOTES.md "Phase 2b"
        // section for the rationale. Defaults to the temp text-only renderer.
        getCellRenderer?: GetCellRendererCallback;
        onReady?: (api: GlideDataGridApi) => void;
    };
}

export default class GlideDataGrid extends Component<GlideDataGridSignature> {
    // Plain (non-tracked) instance field -- deliberately not `@tracked`. Reading it must NOT be
    // an autotracking dependency of `setupGrid` below, or every `scheduleFullRedraw()`-triggering
    // rerun would also register as a change to `this.controller` and could cause redundant reruns.
    private controller: GridHostController | undefined;

    // Reads every `@arg` this component exposes and shapes them into `GridHostArgs`. Called both:
    //   (a) synchronously inside `setupGrid` below -- reading `this.args.*` here, inside that
    //       modifier's autotracking frame, is what makes Ember consider the modifier "dirty" (and
    //       therefore re-run it) whenever any of these args change later.
    //   (b) as the `getArgs` closure `GridHostController` calls fresh on every internal draw/
    //       scroll/hover pass, per its documented calling convention (never cached internally).
    private readonly buildGridHostArgs = (): GridHostArgs => ({
        columns: this.args.columns,
        getCellContent: this.args.getCellContent,
        rows: this.args.rows,
        rowHeight: this.args.rowHeight,
        headerHeight: this.args.headerHeight,
        groupHeaderHeight: this.args.groupHeaderHeight,
        theme: this.args.theme,
        freezeColumns: this.args.freezeColumns,
        getCellRenderer: this.args.getCellRenderer ?? defaultGetCellRenderer,
    });

    // Installs `GridHostController` on the container div on first insert. `ember-modifier`'s
    // functional `modifier()` autotracks its whole function body: this function re-runs whenever
    // any tracked value it read on a previous run changes. `buildGridHostArgs()` below reads every
    // reactive `@arg`, so any of them changing re-runs this function -- at which point
    // `this.controller` is already set, so we just call `scheduleFullRedraw()` rather than
    // reconstructing anything.
    //
    // Deliberately does NOT return a teardown function: `ember-modifier` calls a returned teardown
    // both before every rerun AND on final element removal, with no way to distinguish the two --
    // returning `() => controller.destroy()` here would wrongly destroy the live controller on
    // every single arg change instead of just redrawing it. Final cleanup is instead wired via
    // `registerDestructor`, tied to the component's own destruction, not the modifier's rerun
    // cycle.
    private readonly setupGrid = modifier((element: HTMLDivElement) => {
        // Establishes the autotracking dependency for this modifier's rerun -- see comment above.
        const args = this.buildGridHostArgs();

        if (this.controller === undefined) {
            const controller = new GridHostController({
                root: element,
                getArgs: this.buildGridHostArgs,
            });
            this.controller = controller;
            registerDestructor(this, () => controller.destroy());
            this.args.onReady?.({
                updateCells: (cells: readonly { cell: Item }[]) => controller.updateCells(cells),
            });
        } else {
            void args; // already consumed for tracking; nothing else to do with it here
            this.controller.scheduleFullRedraw();
        }
    });

    <template>
        <div style="width: 100%; height: 100%;" {{this.setupGrid}} ...attributes></div>
    </template>
}
