import { blend } from './color-parser.js';

// Adapted from packages/core/src/common/styles.ts for the Ember port.
//
// Phase 1 scope note: the Theme/FullTheme type definitions, the base theme constant, and the
// pure `mergeAndRealizeTheme`/`getDataEditorTheme` helpers are ported as-is (the render engine
// depends on them directly). `ThemeContext`/`useTheme` (a React Context + hook) are NOT ported --
// this port's theming wiring is plain args on `<GlideDataGrid>` (`@theme`, `@getRowThemeOverride`,
// `column.themeOverride`, `cell.themeOverride`), no context/provider abstraction. See THEMING.md.
//
// Phase 6 additions: `makeCSSStyle` (ported verbatim from source, used by `GridHostController` to
// stamp `--gdg-*` custom properties onto the grid root + each overlay-editor container, mirroring
// source's two application sites) and `getDataEditorDarkTheme` (source ships no dark theme in
// `packages/core`; this is its `docs/examples/theme-support.stories.tsx` `darkTheme` object).

// theme variable precidence

/** @category Theme */

const dataEditorBaseTheme = {
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
  fontFamily: "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  editorFontSize: "13px",
  lineHeight: 1.4,
  //unitless scaler depends on your font
  checkboxMaxSize: 18
};

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
function makeCSSStyle(theme) {
  return {
    "--gdg-accent-color": theme.accentColor,
    "--gdg-accent-fg": theme.accentFg,
    "--gdg-accent-light": theme.accentLight,
    "--gdg-text-dark": theme.textDark,
    "--gdg-text-medium": theme.textMedium,
    "--gdg-text-light": theme.textLight,
    "--gdg-text-bubble": theme.textBubble,
    "--gdg-bg-icon-header": theme.bgIconHeader,
    "--gdg-fg-icon-header": theme.fgIconHeader,
    "--gdg-text-header": theme.textHeader,
    "--gdg-text-group-header": theme.textGroupHeader ?? theme.textHeader,
    "--gdg-bg-group-header": theme.bgGroupHeader ?? theme.bgHeader,
    "--gdg-bg-group-header-hovered": theme.bgGroupHeaderHovered ?? theme.bgHeaderHovered,
    "--gdg-text-header-selected": theme.textHeaderSelected,
    "--gdg-bg-cell": theme.bgCell,
    "--gdg-bg-cell-medium": theme.bgCellMedium,
    "--gdg-bg-header": theme.bgHeader,
    "--gdg-bg-header-has-focus": theme.bgHeaderHasFocus,
    "--gdg-bg-header-hovered": theme.bgHeaderHovered,
    "--gdg-bg-bubble": theme.bgBubble,
    "--gdg-bg-bubble-selected": theme.bgBubbleSelected,
    "--gdg-bubble-height": `${theme.bubbleHeight}px`,
    "--gdg-bubble-padding": `${theme.bubblePadding}px`,
    "--gdg-bubble-margin": `${theme.bubbleMargin}px`,
    "--gdg-bg-search-result": theme.bgSearchResult,
    "--gdg-border-color": theme.borderColor,
    "--gdg-horizontal-border-color": theme.horizontalBorderColor ?? theme.borderColor,
    "--gdg-drilldown-border": theme.drilldownBorder,
    "--gdg-link-color": theme.linkColor,
    "--gdg-cell-horizontal-padding": `${theme.cellHorizontalPadding}px`,
    "--gdg-cell-vertical-padding": `${theme.cellVerticalPadding}px`,
    "--gdg-header-font-style": theme.headerFontStyle,
    "--gdg-base-font-style": theme.baseFontStyle,
    "--gdg-marker-font-style": theme.markerFontStyle,
    "--gdg-font-family": theme.fontFamily,
    "--gdg-editor-font-size": theme.editorFontSize,
    "--gdg-checkbox-max-size": `${theme.checkboxMaxSize}px`,
    ...(theme.resizeIndicatorColor === undefined ? {} : {
      "--gdg-resize-indicator-color": theme.resizeIndicatorColor
    }),
    ...(theme.headerBottomBorderColor === undefined ? {} : {
      "--gdg-header-bottom-border-color": theme.headerBottomBorderColor
    }),
    ...(theme.roundingRadius === undefined ? {} : {
      "--gdg-rounding-radius": `${theme.roundingRadius}px`
    })
  };
}
/** @category Theme */
function getDataEditorTheme() {
  return dataEditorBaseTheme;
}

// Ported verbatim from source's `docs/examples/theme-support.stories.tsx`'s `darkTheme` object
// (source deliberately does NOT ship a dark theme from `packages/core` -- it only exists as an
// example). Kept as a `Partial<Theme>` because that is genuinely what it is: it names only the
// fields that differ from the base light theme and is meant to be layered over it, i.e.
// `mergeAndRealizeTheme(getDataEditorTheme(), getDataEditorDarkTheme())` -- which is exactly what
// passing it as `<GlideDataGrid @theme={{...}}>` already does internally.
const dataEditorDarkTheme = {
  accentColor: "#8c96ff",
  accentLight: "rgba(202, 206, 255, 0.253)",
  textDark: "#ffffff",
  textMedium: "#b8b8b8",
  textLight: "#a0a0a0",
  textBubble: "#ffffff",
  bgIconHeader: "#b8b8b8",
  fgIconHeader: "#000000",
  textHeader: "#a1a1a1",
  textHeaderSelected: "#000000",
  bgCell: "#16161b",
  bgCellMedium: "#202027",
  bgHeader: "#212121",
  bgHeaderHasFocus: "#474747",
  bgHeaderHovered: "#404040",
  bgBubble: "#212121",
  bgBubbleSelected: "#000000",
  bgSearchResult: "#423c24",
  borderColor: "rgba(225,225,225,0.2)",
  drilldownBorder: "rgba(225,225,225,0.4)",
  linkColor: "#4F5DFF",
  headerFontStyle: "bold 14px",
  baseFontStyle: "13px",
  fontFamily: "Inter, Roboto, -apple-system, BlinkMacSystemFont, avenir next, avenir, segoe ui, helvetica neue, helvetica, Ubuntu, noto, arial, sans-serif",
  checkboxMaxSize: 18
};

/**
 * The stock dark theme, as a `Partial<Theme>` overlay meant to be layered over the base theme.
 * Pass it straight to `<GlideDataGrid @theme={{...}}>`, or spread it to tweak individual fields.
 * @category Theme
 */
function getDataEditorDarkTheme() {
  return dataEditorDarkTheme;
}
function mergeAndRealizeTheme(theme, ...overlays) {
  /* The theme is a dynamic key/value overlay by design. */
  /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return */
  const merged = {
    ...theme
  };
  for (const overlay of overlays) {
    if (overlay !== undefined) {
      for (const key in overlay) {
        // eslint-disable-next-line no-prototype-builtins
        if (overlay.hasOwnProperty(key)) {
          if (key === "bgCell") {
            merged[key] = blend(overlay[key], merged[key]);
          } else {
            merged[key] = overlay[key];
          }
        }
      }
    }
  }
  if (merged.headerFontFull === undefined || theme.fontFamily !== merged.fontFamily || theme.headerFontStyle !== merged.headerFontStyle) {
    merged.headerFontFull = `${merged.headerFontStyle} ${merged.fontFamily}`;
  }
  if (merged.baseFontFull === undefined || theme.fontFamily !== merged.fontFamily || theme.baseFontStyle !== merged.baseFontStyle) {
    merged.baseFontFull = `${merged.baseFontStyle} ${merged.fontFamily}`;
  }
  if (merged.markerFontFull === undefined || theme.fontFamily !== merged.fontFamily || theme.markerFontStyle !== merged.markerFontStyle) {
    merged.markerFontFull = `${merged.markerFontStyle} ${merged.fontFamily}`;
  }
  return merged;
}

export { getDataEditorDarkTheme, getDataEditorTheme, makeCSSStyle, mergeAndRealizeTheme };
//# sourceMappingURL=theme.js.map
