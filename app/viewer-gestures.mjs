/** @typedef {[number, number]} Point */
/** @typedef {[number, number, number, number]} Box */
/** @typedef {{left: number, top: number, imageWidth: number, imageHeight: number, center: Point, zoom: number}} View */
const clamp = n => Math.max(0, Math.min(1, n));

/** Map a position within the viewer to the photographed surface. @param {Point} point @param {View} view @returns {Point} */
export function imagePoint(point, view) {
  return [clamp((point[0] - view.left) / view.imageWidth), clamp((point[1] - view.top) / view.imageHeight)];
}

/** Rebase whenever a finger joins or leaves, so a pinch can continue as a pan.
 * @param {Map<number, Point>} pointers @param {View} view
 */
export function rebaseGesture(pointers, view) {
  const [a, b] = [...pointers.values()];
  if (!a) return null;
  return {x: a[0], y: a[1], center: view.center, start: imagePoint(a, view),
    distance: b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : undefined, zoom: view.zoom};
}

/** Use the release position too: fast drags may have no intervening move event.
 * @param {Point} start @param {Point} end @returns {Box}
 */
export function selectionBox(start, end) {
  return [Math.min(start[0], end[0]), Math.min(start[1], end[1]), Math.max(start[0], end[0]), Math.max(start[1], end[1])];
}
