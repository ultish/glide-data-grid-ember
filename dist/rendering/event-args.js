/** @category Types */

/** @category Types */

/** @category Types */
const headerKind = "header";
/** @category Types */

/** @category Types */
const groupHeaderKind = "group-header";
/** @category Types */

/** @category Types */
const outOfBoundsKind = "out-of-bounds";
/** @category Types */

let OutOfBoundsRegionAxis = /*#__PURE__*/function (OutOfBoundsRegionAxis) {
  OutOfBoundsRegionAxis[OutOfBoundsRegionAxis["Start"] = -2] = "Start";
  OutOfBoundsRegionAxis[OutOfBoundsRegionAxis["StartPadding"] = -1] = "StartPadding";
  OutOfBoundsRegionAxis[OutOfBoundsRegionAxis["Center"] = 0] = "Center";
  OutOfBoundsRegionAxis[OutOfBoundsRegionAxis["EndPadding"] = 1] = "EndPadding";
  OutOfBoundsRegionAxis[OutOfBoundsRegionAxis["End"] = 2] = "End";
  return OutOfBoundsRegionAxis;
}({});

/** @category Types */

/** @category Types */

/** @category Types */

/** @category Types */

/** @category Types */

/** Keyboard-initiated activation */

/** Pointer-initiated activation */

/** The public event type the grid emits */

/** @category Types */

function mouseEventArgsAreEqual(args, other) {
  if (args === other) return true;
  if (args?.kind === "out-of-bounds") {
    return args?.kind === other?.kind && args?.location[0] === other?.location[0] && args?.location[1] === other?.location[1] && args?.region[0] === other?.region[0] && args?.region[1] === other?.region[1];
  }
  return args?.kind === other?.kind && args?.location[0] === other?.location[0] && args?.location[1] === other?.location[1];
}

export { OutOfBoundsRegionAxis, groupHeaderKind, headerKind, mouseEventArgsAreEqual, outOfBoundsKind };
//# sourceMappingURL=event-args.js.map
