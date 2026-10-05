// Environment flags shared by sim + render (single evaluation per page).
export const REDUCED_MOTION: boolean = (() => {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) {
    return false;
  }
})();
