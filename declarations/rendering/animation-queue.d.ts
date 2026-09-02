import { CellSet } from "./cell-set.ts";
import type { EnqueueCallback } from "./render/draw-grid-arg.ts";
export type { EnqueueCallback } from "./render/draw-grid-arg.ts";
export declare class AnimationQueue {
    private readonly draw;
    private queue;
    private seq;
    constructor(draw: (items: CellSet) => void);
    private readonly flush;
    private readonly loop;
    readonly enqueue: EnqueueCallback;
}
//# sourceMappingURL=animation-queue.d.ts.map