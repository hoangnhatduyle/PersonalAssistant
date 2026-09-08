"use client";

import { useRef, useState, type TouchEvent } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { Button } from "@/components/ui/Button";
import { DrivingCard, type DrivingCardRow } from "@/components/driving/DrivingCard";
import type { DrivingQueueItem } from "@/lib/driving/build-driving-queue";

export type DrivingCardMeta = { subtitle?: string; tags?: string[]; personLabel?: string };

type Props = {
  items: DrivingQueueItem[];
  getRow: (item: DrivingQueueItem) => DrivingCardRow;
  getMeta: (item: DrivingQueueItem) => DrivingCardMeta;
};

const SWIPE_THRESHOLD_PX = 50;
const NAV_BUTTON_CLASS = "px-8 py-4 text-lg";

export function DrivingCardDeck({ items, getRow, getMeta }: Props) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);

  const clampedIndex = Math.min(index, Math.max(items.length - 1, 0));
  const current = items[clampedIndex];

  const goNext = () => setIndex((current) => Math.min(current + 1, items.length - 1));
  const goPrevious = () => setIndex((current) => Math.max(current - 1, 0));

  const handleTouchStart = (event: TouchEvent) => {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (event: TouchEvent) => {
    const startX = touchStartX.current;
    touchStartX.current = null;
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX;
    if (endX === undefined) return;
    const delta = endX - startX;
    if (delta > SWIPE_THRESHOLD_PX) goPrevious();
    else if (delta < -SWIPE_THRESHOLD_PX) goNext();
  };

  if (items.length === 0 || !current) {
    return (
      <GlassPanel className="flex h-96 w-full items-center justify-center p-12 text-lg text-text-secondary">
        Nothing left today
      </GlassPanel>
    );
  }

  return (
    <div className="flex flex-col gap-4" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <DrivingCard item={current} row={getRow(current)} {...getMeta(current)} />
      <div className="flex items-center justify-between gap-4">
        <Button
          variant="secondary"
          size="md"
          className={NAV_BUTTON_CLASS}
          disabled={clampedIndex === 0}
          onClick={goPrevious}
        >
          ← Previous
        </Button>
        <span className="text-base text-text-secondary">
          {clampedIndex + 1} / {items.length}
        </span>
        <Button
          variant="secondary"
          size="md"
          className={NAV_BUTTON_CLASS}
          disabled={clampedIndex === items.length - 1}
          onClick={goNext}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
