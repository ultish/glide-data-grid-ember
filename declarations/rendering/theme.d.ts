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
/**
 * Maps a theme onto the `--gdg-*` CSS custom properties. Ported verbatim from source's
 * `common/styles.ts:7` (minus the React import it sat next to). Source applies the result at two
 * places -- the DataEditor root element (`data-editor.tsx:4215`, using the *global* merged theme)
 * and each overlay-editor container (`data-grid-overlay-editor.tsx:237`, using that specific
 * cell's fully-merged theme) -- and this port mirrors both sites from `GridHostController`.
 *
 * The grid's own canvas rendering does not read these; they exist so consumers can style anything
 * they layer on top of (or inside) the grid using the grid's own resolved theme values.
 * @category Theme
 */
export declare function makeCSSStyle(theme: Theme): Record<string, string>;
export interface FullTheme extends Theme {
    headerFontFull: string;
    baseFontFull: string;
    markerFontFull: string;
}
/** @category Theme */
export declare function getDataEditorTheme(): Theme;
/**
 * The stock dark theme, as a `Partial<Theme>` overlay meant to be layered over the base theme.
 * Pass it straight to `<GlideDataGrid @theme={{...}}>`, or spread it to tweak individual fields.
 * @category Theme
 */
export declare function getDataEditorDarkTheme(): Partial<Theme>;
export declare function mergeAndRealizeTheme(theme: Theme, ...overlays: Partial<Theme | undefined>[]): FullTheme;
//# sourceMappingURL=theme.d.ts.map