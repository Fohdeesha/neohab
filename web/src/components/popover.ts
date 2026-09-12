// A popover list is placed against its input's box, so only a scroll in one of that input's own
// ancestors can move it. Any other scroller - a log tile following its newest line once a second -
// must be left alone, or the list closes under whoever is typing into it.
export function scrollMoves(target: EventTarget | null, el: Element | null): boolean {
  if (!el) return false
  if (target === window) return true
  return target instanceof Node && target.contains(el)
}
