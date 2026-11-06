"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The element the panel hangs off (the trigger). Clicks on it don't count as "outside". */
  anchorRef: RefObject<HTMLElement | null>;
  /** Where focus returns on Escape; defaults to the anchor. Pass it when the anchor wraps the real focus target (e.g. a text input beside its calendar button). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Accessible name of the panel (role="dialog"). */
  label: string;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const VIEWPORT_MARGIN_PX = 8;
const ANCHOR_GAP_PX = 6;

/**
 * A floating panel anchored to a trigger — used by the date pickers.
 *
 * Portaled to <body> with fixed positioning so neither a Dialog's
 * `overflow-y-auto` body nor a scroll container clips it, and stacked above
 * Dialog (z-50) and the calendar pickers (z-60). It is placed below the
 * anchor (flipped above when there is no room below), kept inside the
 * viewport horizontally, and re-placed while anything scrolls or resizes.
 *
 * Escape is handled in the capture phase and stopped there, so pressing it
 * inside a popover that sits in a Dialog closes only the popover — Dialog's
 * own Escape listener (window, bubble phase) never sees that keypress.
 */
export function Popover({ open, onClose, anchorRef, returnFocusRef, label, children }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without re-subscribing the document listeners on every render.
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const panel = panelRef.current;
      const anchor = anchorRef.current;
      if (!panel || !anchor) return;
      const anchorRect = anchor.getBoundingClientRect();
      const { offsetWidth: width, offsetHeight: height } = panel;

      let left = anchorRect.left;
      if (left + width + VIEWPORT_MARGIN_PX > window.innerWidth) {
        left = Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - width - VIEWPORT_MARGIN_PX);
      }

      let top = anchorRect.bottom + ANCHOR_GAP_PX;
      const fitsBelow = top + height + VIEWPORT_MARGIN_PX <= window.innerHeight;
      const flippedTop = anchorRect.top - ANCHOR_GAP_PX - height;
      if (!fitsBelow && flippedTop >= VIEWPORT_MARGIN_PX) top = flippedTop;

      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.visibility = "visible";
    };

    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onCloseRef.current();
      (returnFocusRef ?? anchorRef).current?.focus();
    };

    document.addEventListener("mousedown", handlePointerDown, true);
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [open, anchorRef, returnFocusRef]);

  const returnFocus = () => (returnFocusRef ?? anchorRef).current?.focus();

  // The panel is portaled to the end of <body>, so the browser's own Tab order would drop focus
  // somewhere unrelated. Tabbing off either end closes it and hands focus back to the field instead.
  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;
    const focusable = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);
    if (focusable.length === 0) return;
    const active = document.activeElement;
    const leavingForward = !event.shiftKey && active === focusable[focusable.length - 1];
    const leavingBackward = event.shiftKey && active === focusable[0];
    if (!leavingForward && !leavingBackward) return;
    event.preventDefault();
    onCloseRef.current();
    returnFocus();
  };

  // Focus moving to some other control (not the panel, not its anchor) ends the interaction.
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (!next) return;
    if (panelRef.current?.contains(next) || anchorRef.current?.contains(next)) return;
    onCloseRef.current();
  };

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      // Hidden until place() has measured it, so it never flashes at 0,0.
      style={{ position: "fixed", top: 0, left: 0, visibility: "hidden" }}
      className="z-[70] max-w-[calc(100vw-16px)] rounded-panel border border-panel-border bg-bg-void-elevated p-3 shadow-panel-raised"
    >
      {children}
    </div>,
    document.body,
  );
}
