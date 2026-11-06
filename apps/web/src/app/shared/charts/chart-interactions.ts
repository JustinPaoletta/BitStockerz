export function chartInteractionOptions() {
  const coarse =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;
  // Vertical gestures scroll the page; horizontal drag and pinch explore the chart.
  // On touch devices, external wheels should also scroll the page rather than trap it.
  return {
    handleScroll: { vertTouchDrag: false, horzTouchDrag: true, mouseWheel: !coarse },
    handleScale: { pinch: true, mouseWheel: !coarse },
  };
}
