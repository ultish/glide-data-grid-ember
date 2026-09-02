import { CellSet } from "../cell-set.ts";
import { WindowingTrackerBase } from "./render-state-provider.ts";
import type { ImageWindowLoader } from "../image-window-loader-interface.ts";
declare class ImageWindowLoaderImpl extends WindowingTrackerBase implements ImageWindowLoader {
    private imageLoaded;
    private loadedLocations;
    private cache;
    setCallback(imageLoaded: (locations: CellSet) => void): void;
    private sendLoaded;
    protected clearOutOfWindow: () => void;
    private loadImage;
    loadOrGetImage(url: string, col: number, row: number): HTMLImageElement | ImageBitmap | undefined;
}
export default ImageWindowLoaderImpl;
//# sourceMappingURL=image-window-loader.d.ts.map