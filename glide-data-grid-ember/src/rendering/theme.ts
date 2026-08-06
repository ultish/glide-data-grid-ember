// Adapted from packages/core/src/common/styles.ts for the Ember port.
//
// Phase 1 scope note: the Theme/FullTheme type definitions, the base theme constant, and the
// pure `mergeAndRealizeTheme`/`getDataEditorTheme` helpers are ported as-is (the render engine
// depends on them directly). `ThemeContext`/`useTheme` (a React Context + hook) are NOT ported --
// Ember's theming wiring (likely a service or context-like pattern) is a later phase. `makeCSSStyle`
// is also not ported: nothing in the ported render-engine file set imports it (it is only used by
// the React DataEditor component wiring for setting CSS custom properties on the DOM, which is out
// of scope here).
import { blend } from "./color-parser.ts";

// theme variable precidence

/** @category Theme */
export interface Theme {
    accentColor: string;
    accentFg: string;
    accentLight: string;
    textDark: string;
    textMedium: string;
    textLight: string;
    textBubble: string;
    bgIconHeader: string;
    fgIconHeader: string;
    textHeader: string;
    textGroupHeader?: string;
    bgGroupHeader?: string;
    bgGroupHeaderHovered?: string;
    textHeaderSelected: string;
    bgCell: string;
    bgCellMedium: string;
    bgHeader: string;
    bgHeaderHasFocus: string;
    bgHeaderHovered: string;
    bgBubble: string;
    bgBubbleSelected: string;
    bubbleHeight: number;
    bubblePadding: number;
    bubbleMargin: number;
    bgSearchResult: string;
    borderColor: string;
    drilldownBorder: string;
    linkColor: string;
    cellHorizontalPadding: number;
    cellVerticalPadding: number;
    headerFontStyle: string;
    headerIconSize: number;
    baseFontStyle: string;
    markerFontStyle: string;
    fontFamily: string;
    editorFontSize: string;
    lineHeight: number;
    checkboxMaxSize: number;

    resizeIndicatorColor?: string;
    horizontalBorderColor?: string;
    headerBottomBorderColor?: string;
    roundingRadius?: number;
}

const dataEditorBaseTheme: Theme = {
    accentColor: "#4F5DFF",
    accentFg: "#FFFFFF",
    accentLight: "rgba(62, 116, 253, 0.1)",

    textDark: "#313139",
    textMedium: "#737383",
    textLight: "#B2B2C0",
    textBubble: "#313139",

    bgIconHeader: "#737383",
    fgIconHeader: "#FFFFFF",
    textHeader: "#313139",
    textGroupHeader: "#313139BB",
    textHeaderSelected: "#FFFFFF",

    bgCell: "#FFFFFF",
    bgCellMedium: "#FAFAFB",
    bgHeader: "#F7F7F8",
    bgHeaderHasFocus: "#E9E9EB",
    bgHeaderHovered: "#EFEFF1",

    bgBubble: "#EDEDF3",
    bgBubbleSelected: "#FFFFFF",
    bubbleHeight: 20,
    bubblePadding: 6,
    bubbleMargin: 4,

    bgSearchResult: "#fff9e3",

    borderColor: "rgba(115, 116, 131, 0.16)",
    drilldownBorder: "rgba(0, 0, 0, 0)",

    linkColor: "#353fb5",

    cellHorizontalPadding: 8,
    cellVerticalPadding: 3,

    headerIconSize: 18,

    headerFontStyle: "600 13px",
    baseFontStyle: "13px",
    markerFontStyle: "9px",
    fontFamily:
        "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
    editorFontSize: "13px",
    lineHeight: 1.4, //unitless scaler depends on your font
    checkboxMaxSize: 18,
};

export interface FullTheme extends Theme {
    headerFontFull: string;
    baseFontFull: string;
    markerFontFull: string;
}

/** @category Theme */
export function getDataEditorTheme(): Theme {
    return dataEditorBaseTheme;
}

export function mergeAndRealizeTheme(theme: Theme, ...overlays: Partial<Theme | undefined>[]): FullTheme {
    const merged: any = { ...theme };

    for (const overlay of overlays) {
        if (overlay !== undefined) {
            for (const key in overlay) {
                // eslint-disable-next-line no-prototype-builtins
                if (overlay.hasOwnProperty(key)) {
                    if (key === "bgCell") {
                        merged[key] = blend(overlay[key] as string, merged[key]);
                    } else {
                        merged[key] = (overlay as any)[key];
                    }
                }
            }
        }
    }

    if (
        merged.headerFontFull === undefined ||
        theme.fontFamily !== merged.fontFamily ||
        theme.headerFontStyle !== merged.headerFontStyle
    ) {
        merged.headerFontFull = `${merged.headerFontStyle} ${merged.fontFamily}`;
    }

    if (
        merged.baseFontFull === undefined ||
        theme.fontFamily !== merged.fontFamily ||
        theme.baseFontStyle !== merged.baseFontStyle
    ) {
        merged.baseFontFull = `${merged.baseFontStyle} ${merged.fontFamily}`;
    }

    if (
        merged.markerFontFull === undefined ||
        theme.fontFamily !== merged.fontFamily ||
        theme.markerFontStyle !== merged.markerFontStyle
    ) {
        merged.markerFontFull = `${merged.markerFontStyle} ${merged.fontFamily}`;
    }

    return merged;
}
