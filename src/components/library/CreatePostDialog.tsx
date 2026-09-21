"use client";

import { useState } from "react";
import { useCreateLibraryPost } from "@/hooks/useLibraryPosts";
import { useLibraryImageUploads, type UploadItem } from "@/hooks/useLibraryPostImages";
import { PostForm } from "@/components/library/PostForm";
import { PostImageUploader } from "@/components/library/PostImageUploader";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Toast";
import type { LibraryPostPayload } from "@/lib/api/library-schemas";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Create flow: fields + staged screenshots -> create the post -> upload the
 * screenshots one request at a time, with per-file progress/retry. The
 * dialog stays open (and can't be dismissed) while uploads run; the post
 * already exists by then, so a failed screenshot can be retried here or
 * re-added from the post's page.
 */
export function CreatePostDialog({ open, onClose }: Props) {
  const createPost = useCreateLibraryPost();
  const { showToast } = useToast();
  const [isUploadPhase, setUploadPhase] = useState(false);

  const handleClose = () => {
    setUploadPhase(false);
    uploads.clearSettled();
    onClose();
  };

  const handleDrained = (items: UploadItem[]) => {
    if (items.every((item) => item.status === "done")) {
      showToast("Post saved", "success");
      handleClose();
    } else {
      showToast("Post saved, but some screenshots failed to upload", "error");
    }
  };

  const uploads = useLibraryImageUploads({ onDrained: handleDrained });

  const handleSubmit = async (values: LibraryPostPayload) => {
    const post = await createPost.mutateAsync(values);
    if (uploads.items.length === 0) {
      showToast("Post saved", "success");
      handleClose();
      return;
    }
    setUploadPhase(true);
    uploads.start(post.id);
  };

  return (
    <Dialog open={open} onClose={uploads.isUploading ? () => {} : handleClose} title={isUploadPhase ? "Uploading screenshots" : "Save a post"} size="lg">
      {isUploadPhase ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary">Your post is saved. Uploading its screenshots…</p>
          <PostImageUploader items={uploads.items} onAdd={() => {}} onRemove={uploads.remove} onRetry={uploads.retry} remainingSlots={0} queueOnly />
          <div className="flex justify-end">
            <Button onClick={handleClose} disabled={uploads.isUploading}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <PostForm
          onSubmit={handleSubmit}
          onCancel={handleClose}
          submitLabel="Save post"
          imageSlot={
            <PostImageUploader items={uploads.items} onAdd={uploads.add} onRemove={uploads.remove} onRetry={uploads.retry} remainingSlots={uploads.remainingSlots} />
          }
        />
      )}
    </Dialog>
  );
}
