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
export function lookup<T>(table: Record<string, T>, key: string | undefined | null): T | undefined {
  if (typeof key !== 'string') return undefined
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined
}
