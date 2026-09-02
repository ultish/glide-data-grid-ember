function proveType(val) {
}
function panic(message = "This should not happen") {
  throw new Error(message);
}
function assert(fact, message = "Assertion failed") {
  if (fact) return;
  return panic(message);
}
function assertNever(_never, msg) {
  return panic(msg ?? "Hell froze over");
}
function maybe(fn, defaultValue) {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
}

// The following code is licensed under the MIT license to Luke Edwards
// Original license and code can be found here: https://github.com/lukeed/dequal/blob/master/license
// I have merely "ported" it to be TS (any any any) and directly included it for convenience.
/* The upstream dequal implementation intentionally uses dynamic values. */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/unbound-method */
const has = Object.prototype.hasOwnProperty;
function deepEqual(foo, bar) {
  let ctor, len;
  if (foo === bar) return true;
  if (foo && bar && (ctor = foo.constructor) === bar.constructor) {
    if (ctor === Date) return foo.getTime() === bar.getTime();
    if (ctor === RegExp) return foo.toString() === bar.toString();
    if (ctor === Array) {
      if ((len = foo.length) === bar.length) {
        while (len-- && deepEqual(foo[len], bar[len]));
      }
      return len === -1;
    }
    if (!ctor || typeof foo === "object") {
      len = 0;
      for (ctor in foo) {
        if (has.call(foo, ctor) && ++len && !has.call(bar, ctor)) return false;
        if (!(ctor in bar) || !deepEqual(foo[ctor], bar[ctor])) return false;
      }
      return Object.keys(bar).length === len;
    }
  }
  return foo !== foo && bar !== bar;
}

/**
 * This is a type that takes a type and makes all of its properties required.
 * This is useful for forcing a an object to have all properties defined from the get go, which helps V8 optimize it.
 */

export { assert, assertNever, deepEqual, maybe, proveType };
//# sourceMappingURL=support.js.map
