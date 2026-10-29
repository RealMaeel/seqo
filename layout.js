// SEQO — how the overlay's content fills its window (2.7.2).
//   zoom  (default): the 480×290 layout scales to the window — a bigger window makes everything bigger
//   room           : text stays at the size you pick (70–150%) and a bigger window shows MORE —
//                    longer lists, wider rows, Plane of Sky quests side by side
// A player asked for "room" (Oct 28 2026): on a second monitor, Zoom only made everything huge.
// Pure; 31-settings.js applies the result to #content.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EQLLayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const ZOOM_MIN = 70, ZOOM_MAX = 150;
  const clampZoom = (z) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.round(+z || 100)));
  // → { scale, width?, height? } — width/height (CSS px, before scaling) only in room mode
  function contentBox({ mode, zoom, availW, availH, baseW, baseH }) {
    if (mode !== 'room') return { scale: Math.min(availW / baseW, availH / baseH) };
    const scale = clampZoom(zoom) / 100;
    // never smaller than the base layout: a tiny window in room mode just shows the base layout smaller
    const width = Math.max(baseW, availW / scale), height = Math.max(baseH, availH / scale);
    const fit = Math.min(1, availW / (width * scale), availH / (height * scale));
    return { scale: scale * fit, width: Math.floor(width), height: Math.floor(height) };
  }
  return { contentBox, clampZoom, ZOOM_MIN, ZOOM_MAX };
});
