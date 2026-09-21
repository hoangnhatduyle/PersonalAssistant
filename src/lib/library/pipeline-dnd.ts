import type { KeyboardCoordinateGetter } from "@dnd-kit/core";
import { isApplicationStatus, type ApplicationStatus } from "@/lib/library/application-status";

export interface ColumnRect {
  id: string | number;
  left: number;
  top: number;
  width: number;
}

/**
 * The column to the left (-1) or right (1) of the one containing `centerX`
 * (or, in a gutter / off to the side, the nearest one). Undefined at an edge.
 */
export function pickAdjacentColumn(columns: readonly ColumnRect[], centerX: number, direction: 1 | -1): ColumnRect | undefined {
  if (columns.length === 0) return undefined;
  const sorted = [...columns].sort((a, b) => a.left - b.left);

  const current = sorted.reduce((best, column, index) => {
    const distance = Math.abs(column.left + column.width / 2 - centerX);
    return distance < best.distance ? { index, distance } : best;
  }, { index: 0, distance: Number.POSITIVE_INFINITY }).index;

  return sorted[current + direction];
}

/** A droppable id is a status when it is one of the six application statuses. */
export function statusFromDroppableId(id: unknown): ApplicationStatus | null {
  return isApplicationStatus(id) ? id : null;
}

/**
 * Keyboard drag for the pipeline board: ArrowLeft / ArrowRight hop the
 * dragged card to the neighbouring status column. (dnd-kit's stock
 * sortableKeyboardCoordinates only understands cards inside a
 * SortableContext; here cards are plain draggables and columns the only
 * droppables, so the move is just "next column over".)
 */
export const pipelineKeyboardCoordinates: KeyboardCoordinateGetter = (event, { context: { active, collisionRect, droppableRects, droppableContainers } }) => {
  const direction = event.code === "ArrowRight" ? 1 : event.code === "ArrowLeft" ? -1 : 0;
  if (direction === 0 || !active || !collisionRect) return undefined;
  event.preventDefault();

  const columns = droppableContainers.getEnabled().flatMap((container) => {
    const rect = droppableRects.get(container.id);
    return rect ? [{ id: container.id, left: rect.left, top: rect.top, width: rect.width }] : [];
  });
  const target = pickAdjacentColumn(columns, collisionRect.left + collisionRect.width / 2, direction);
  if (!target) return undefined;

  // The dragged rect's top-left, centred in the target column and dropped just below its header.
  return { x: target.left + Math.max(0, (target.width - collisionRect.width) / 2), y: target.top + 56 };
};
