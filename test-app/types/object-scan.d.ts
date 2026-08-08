// Minimal ambient types for `object-scan` (v20), which ships no `.d.ts` of its own.
//
// Scoped to the two options this app actually uses -- see
// `app/utils/scale-records.ts` for the worked example and `glide-data-grid-ember/DATA.md`'s
// "Where formatting and nested data go" for why the traversal lives on the consumer side of the
// boundary (the addon deliberately depends on no path/traversal library).
declare module "object-scan" {
    interface ObjectScanOptions {
        /** `false` -> array indices are not part of the needle, so `pets.name` matches every element. */
        readonly useArraySelector?: boolean;
        /** `"value"` -> the compiled scanner returns the matched *values* rather than their key paths. */
        readonly rtn?: "value" | "key" | "entry" | "count" | "bool";
        readonly abort?: boolean;
        readonly joined?: boolean;
    }

    /**
     * Compiles a set of needles into a reusable scanner. **Compile once** (module scope, one per
     * column) and reuse across every record -- recompiling per cell is the single biggest cost in
     * the naive form.
     */
    function objectScan(needles: readonly string[], options?: ObjectScanOptions): (haystack: unknown) => unknown;

    export default objectScan;
}
