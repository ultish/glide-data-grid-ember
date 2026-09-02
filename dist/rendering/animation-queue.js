import { CellSet } from './cell-set.js';
import { unpackNumberToColRow, packColRowToNumber } from './common/render-state-provider.js';

// Ported from packages/core/src/internal/data-grid/use-animation-queue.ts (Phase 2 of the Ember
// port).
//
// The source implementation was a React hook (`useAnimationQueue`) that wrapped this exact
// batching logic in `React.useRef`/`React.useCallback` bookkeeping so it could be safely recreated
// across renders. None of that is React-specific -- it is a small queue of packed [col, row]
// numbers that gets flushed once per animation frame, coalescing any cells enqueued multiple times
// within the same frame into a single `draw` callback invocation. This class ports the queue/flush
// logic verbatim (including the `seq > 600` backoff) and drops the hook wrapper; Ember call sites
// (the grid host controller) own the instance directly instead of memoizing it via a hook.

class AnimationQueue {
  queue = [];
  seq = 0;
  constructor(draw) {
    this.draw = draw;
  }
  flush = () => {
    const toDraw = this.queue.map(unpackNumberToColRow);
    this.queue = [];
    this.draw(new CellSet(toDraw));
    if (this.queue.length > 0) {
      this.seq++;
    } else {
      this.seq = 0;
    }
  };
  loop = () => {
    // Backoff: after 600 consecutive frames of continuous queueing, insert an extra frame of
    // delay before each flush so a cell that keeps re-enqueueing itself forever (e.g. a
    // never-settling animation) can't peg the frame rate indefinitely.
    const requeue = () => window.requestAnimationFrame(this.flush);
    window.requestAnimationFrame(this.seq > 600 ? requeue : this.flush);
  };
  enqueue = item => {
    if (this.queue.length === 0) this.loop();
    const packed = packColRowToNumber(item[0], item[1]);
    if (this.queue.includes(packed)) return;
    this.queue.push(packed);
  };
}

export { AnimationQueue };
//# sourceMappingURL=animation-queue.js.map
