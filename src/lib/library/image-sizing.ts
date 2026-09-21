/**
 * Fits (width, height) inside a maxEdge x maxEdge box preserving aspect
 * ratio. Never enlarges; never returns a zero-sized edge.
 */
export function computeTargetSize(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return { width, height };
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
