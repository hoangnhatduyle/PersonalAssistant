import { deleteOccurrenceOverride, putOccurrenceOverride } from "@/lib/api/occurrence-overrides";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** PUT /api/courses/[id]/occurrences — cancel or move/resize ONE occurrence of a recurring course; the series is untouched. */
export async function PUT(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return putOccurrenceOverride("courses", id, request);
}

/** DELETE /api/courses/[id]/occurrences?original_date=&original_start_minutes= — revert one occurrence to the series. */
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  return deleteOccurrenceOverride("courses", id, request);
}
