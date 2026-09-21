import { requireAuthenticatedContext } from "@/lib/api/auth";
import {
  conflictResponse,
  notFoundResponse,
  serverErrorResponse,
  successResponse,
  validationErrorResponse,
} from "@/lib/api/response";
import { MAX_IMAGES_PER_POST, MAX_UPLOAD_BYTES } from "@/lib/library/constants";
import { addImage } from "@/lib/library/server/post-images";

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/library/posts/[id]/images — multipart `{file}`, ONE image per
 * request (keeps every body under Vercel's ~4.5MB limit; the client
 * uploads a queue sequentially).
 */
export async function POST(request: Request, { params }: RouteParams) {
  const ctx = await requireAuthenticatedContext();
  if (!("supabase" in ctx)) return ctx;
  const { supabase, user } = ctx;
  const { id } = await params;

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return validationErrorResponse("Expected multipart/form-data with a `file` field");
  if (file.size > MAX_UPLOAD_BYTES) return validationErrorResponse("Image is too large (max 4 MB)");

  try {
    const result = await addImage(supabase, user.id, id, Buffer.from(await file.arrayBuffer()));
    if (result.ok) return successResponse(result.image, { status: 201 });
    if (result.reason === "invalid_image") return validationErrorResponse(result.message);
    if (result.reason === "limit_reached") return conflictResponse(`A post can hold at most ${MAX_IMAGES_PER_POST} screenshots`);
    return notFoundResponse();
  } catch (error) {
    return serverErrorResponse("library post image upload failed", error);
  }
}
