import { useEffect, useRef, useState, type RefObject } from "react";

type DragToPan<T extends HTMLElement> = {
  isPanning: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  onMouseDown: (event: React.MouseEvent<T>) => void;
};

/**
 * Trello-style "grab the empty background to scroll" for a horizontally
 * overflowing row. Only starts panning when the mousedown target is the
 * scrolling element itself (not a child like a card or column), so it can
 * never fight a drag-and-drop library whose listeners live on those
 * children. `recomputeDeps` lets a caller force canScrollLeft/Right to
 * re-check after content changes that don't fire a scroll/resize event
 * (e.g. a column being added or removed).
 *
 * Takes the scroll element's ref instead of creating and returning its own
 * (see WeekGrid.tsx for the same convention) — bundling a ref into the same
 * object as reactive state trips the React Compiler's react-hooks/refs rule,
 * since it can no longer verify that other property reads on that object
 * are safe during render.
 */
export function useDragToPan<T extends HTMLElement>(ref: RefObject<T | null>, recomputeDeps: unknown[] = []): DragToPan<T> {
  const panRef = useRef<{ startX: number; startScrollLeft: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const updateEdges = () => {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    updateEdges();
    el.addEventListener("scroll", updateEdges);
    window.addEventListener("resize", updateEdges);
    return () => {
      el.removeEventListener("scroll", updateEdges);
      window.removeEventListener("resize", updateEdges);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recomputeDeps is the caller's explicit "content changed, re-check edges" signal.
  }, recomputeDeps);

  useEffect(() => {
    if (!isPanning) return;

    const handleMouseMove = (event: MouseEvent) => {
      const el = ref.current;
      if (!el || !panRef.current) return;
      el.scrollLeft = panRef.current.startScrollLeft - (event.clientX - panRef.current.startX);
    };
    const handleMouseUp = () => {
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isPanning, ref]);

  function onMouseDown(event: React.MouseEvent<T>) {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const el = ref.current;
    if (!el) return;
    event.preventDefault();
    panRef.current = { startX: event.clientX, startScrollLeft: el.scrollLeft };
    setIsPanning(true);
  }

  return { isPanning, canScrollLeft, canScrollRight, onMouseDown };
}
