/**
 * Reading a plain-object table with a key this code did not choose.
 *
 * `TABLE[key]` walks the prototype chain, so `constructor`, `toString`, `valueOf`,
 * `hasOwnProperty` and `__proto__` all find something on `Object.prototype` instead of missing -
 * and because what they find is a function or an object rather than `undefined`, a trailing
 * `?? fallback` never fires. The value then travels on as if it were real.
 *
 * This has produced five bugs in this project, in two modules, over two months:
 *
 *   - a HABPanel widget typed `constructor` found `Object.prototype.constructor`, was CALLED as a
 *     converter and took the whole import down (fixed 2026-07-15);
 *   - a chart whose stored period was `toString` silently lost its period;
 *   - `settingsPatch.theme` was handed the `Object` function, which `JSON.stringify` then dropped
 *     without a word, so the theme quietly vanished from saved settings;
 *   - a semantic tag named `constructor` - and tags are user-defined, so this is a thing somebody
 *     can actually create - produced the icon `mdi:function Object() { [native code] }`;
 *   - `widgetChoices` threw `list.filter is not a function` while rendering the generator preview.
 *
 * Every one of those keys arrives from an uploaded file, a stored config or the server's own item
 * and tag lists, none of which this code controls. So the rule is: any table indexed by such a
 * key is read through here, and the next table someone adds cannot reintroduce it.
 *
 * Where the key is genuinely internal (a fixed union type, a literal), a bare index is fine.
 */
/**
 * The other half of the same problem: a map this code BUILDS whose keys it does not choose.
 *
 * `lookup()` fixes one read. A map keyed by item names is read from a dozen places and gains more
 * over time, so fixing it read by read only holds until somebody adds the thirteenth. Building it
 * without a prototype fixes every read at once, including the ones written later, and makes `in`
 * and `hasOwnProperty` agree with the index.
 *
 * openHAB item names are `[a-zA-Z_][a-zA-Z0-9_]*` (`ItemUtil.isValidItemName`), so `constructor`,
 * `toString`, `valueOf`, `hasOwnProperty` and `__proto__` are all names a person can give an item.
 * With a normal object behind it, a Switch bound to one of them threw while rendering, and a JS
 * widget asking for its state hung for good, because `postMessage` cannot structured-clone the
 * `Object` function it was handed instead of `undefined`.
 */
export function emptyMap<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}

/**
 * Merge into a fresh prototype-free map.
 *
 * `Object.assign` rather than object spread, deliberately: spread copies own properties onto a
 * NORMAL object, so the result would carry `Object.prototype` again. Assigning onto a
 * prototype-free target has no inherited setter to trigger, so a delta carrying `__proto__` as an
 * own property - which is exactly what `JSON.parse` produces for an item of that name - lands as
 * ordinary data and reaches no other object.
 */
export function mergeMap<T>(...parts: (Record<string, T> | undefined)[]): Record<string, T> {
  const out = emptyMap<T>()
  for (const part of parts) if (part) Object.assign(out, part)
  return out
}

export function lookup<T>(table: Record<string, T>, key: string | undefined | null): T | undefined {
  if (typeof key !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}
