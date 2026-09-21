"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeleteLibraryPost, useLibraryPost, useUpdateLibraryPost } from "@/hooks/useLibraryPosts";
import { useDeleteLibraryPostImage, useLibraryImageUploads } from "@/hooks/useLibraryPostImages";
import { PlatformBadge } from "@/components/library/PlatformBadge";
import { PostForm } from "@/components/library/PostForm";
import { PostGallery } from "@/components/library/PostGallery";
import { PostImageUploader } from "@/components/library/PostImageUploader";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { ApiError } from "@/lib/http/client";
import { displayHost, safeExternalHref } from "@/lib/library/url";
import type { LibraryPostPayload } from "@/lib/api/library-schemas";
import type { LibraryPostImage, LibraryPostWithRelations } from "@/lib/api/entity-types";

type Props = {
  id: string;
};

export function PostDetail({ id }: Props) {
  const router = useRouter();
  const { data: post, isLoading, error } = useLibraryPost(id);

  const goBack = () => (window.history.length > 1 ? router.back() : router.push("/library"));

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !post) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <EmptyState
        title={notFound ? "Post not found" : "Could not load this post"}
        description={notFound ? "It may have been deleted." : "Check your connection and try again."}
        action={
          <Button variant="secondary" onClick={goBack}>
            Back to Library
          </Button>
        }
      />
    );
  }

  return <PostDetailBody post={post} onBack={goBack} />;
}

function PostDetailBody({ post, onBack }: { post: LibraryPostWithRelations; onBack: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isEditOpen, setEditOpen] = useState(false);
  const [isDeleteOpen, setDeleteOpen] = useState(false);
  const updatePost = useUpdateLibraryPost(post.id);
  const deletePost = useDeleteLibraryPost(post.id);
  const deleteImage = useDeleteLibraryPostImage();
  const uploads = useLibraryImageUploads({
    postId: post.id,
    existingCount: post.images.length,
    onDrained: (items) => {
      if (items.some((item) => item.status === "error")) showToast("Some screenshots failed to upload", "error");
      else {
        showToast("Screenshots added", "success");
        uploads.clearSettled();
      }
    },
  });

  const href = safeExternalHref(post.url);
  const host = displayHost(post.url);
  const saved = new Date(post.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const patch = async (changes: Parameters<typeof updatePost.mutateAsync>[0], message?: string) => {
    try {
      await updatePost.mutateAsync(changes);
      if (message) showToast(message, "success");
    } catch {
      showToast("Could not update the post", "error");
    }
  };

  const handleEdit = async (values: LibraryPostPayload) => {
    await updatePost.mutateAsync(values);
    showToast("Post updated", "success");
    setEditOpen(false);
  };

  const handleDelete = async () => {
    try {
      await deletePost.mutateAsync();
      showToast("Post deleted", "success");
      router.push("/library");
    } catch {
      showToast("Could not delete the post", "error");
    }
  };

  const handleDeleteImage = async (image: LibraryPostImage) => {
    try {
      await deleteImage.mutateAsync(image.id);
    } catch {
      showToast("Could not remove the screenshot", "error");
    }
  };

  return (
    <article className="library-atmosphere flex flex-col gap-6 rounded-panel">
      <div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Library
        </Button>
      </div>

      <header className="flex flex-col gap-3">
        <p className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-wide text-text-eyebrow">
          <PlatformBadge platform={post.platform} />
          {post.author_name && <span>{post.author_name}</span>}
          <span>Saved {saved}</span>
          {post.archived_at && <span className="text-status-warn">Archived</span>}
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight text-text-primary">{post.title}</h1>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="w-fit font-mono text-sm text-accent-indigo underline underline-offset-4 hover:text-text-primary">
            Open original{host ? ` on ${host}` : ""} ↗
          </a>
        )}
        {post.url && !href && <p className="font-mono text-sm text-text-secondary">{post.url}</p>}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <Switch checked={post.is_favorite} onCheckedChange={(checked) => patch({ is_favorite: checked })} label="Favorite" />
        <Button variant="secondary" size="sm" onClick={() => patch({ archived: !post.archived_at }, post.archived_at ? "Post restored" : "Post archived")} disabled={updatePost.isPending}>
          {post.archived_at ? "Unarchive" : "Archive"}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setEditOpen(true)}>
          Edit
        </Button>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          Delete
        </Button>
      </div>

      <PostGallery images={post.images} title={post.title} onDelete={handleDeleteImage} isDeleting={deleteImage.isPending} />

      <section aria-label="Add screenshots" className="max-w-xl">
        <PostImageUploader items={uploads.items} onAdd={uploads.add} onRemove={uploads.remove} onRetry={uploads.retry} remainingSlots={uploads.remainingSlots} />
      </section>

      {post.notes && (
        <section aria-labelledby="library-notes-heading" className="max-w-2xl">
          <h2 id="library-notes-heading" className="mb-1.5 font-mono text-xs uppercase tracking-wide text-text-eyebrow">
            Notes
          </h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-primary">{post.notes}</p>
        </section>
      )}

      {post.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
          {post.tags.map((tag) => (
            <li key={tag}>
              <Link href={`/library?tag=${encodeURIComponent(tag)}`} className="rounded-full border border-panel-border px-2.5 py-1 font-mono text-xs text-text-secondary transition-colors hover:border-panel-border-hover hover:text-text-primary">
                {tag}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {(post.people.length > 0 || post.courses.length > 0) && (
        <section aria-label="Linked" className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
          {post.people.length > 0 && (
            <div>
              <h2 className="mb-1 font-mono text-xs uppercase tracking-wide text-text-eyebrow">People</h2>
              <p className="text-text-primary">{post.people.map((person) => person.name).join(", ")}</p>
            </div>
          )}
          {post.courses.length > 0 && (
            <div>
              <h2 className="mb-1 font-mono text-xs uppercase tracking-wide text-text-eyebrow">Courses</h2>
              <ul className="flex flex-wrap gap-x-3">
                {post.courses.map((course) => (
                  <li key={course.id}>
                    <Link href={`/courses/${course.id}`} className="text-accent-indigo underline underline-offset-2 hover:text-text-primary">
                      {course.code ? `${course.code} · ${course.name}` : course.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <Dialog open={isEditOpen} onClose={() => setEditOpen(false)} title="Edit post" size="lg">
        <PostForm post={post} onSubmit={handleEdit} onCancel={() => setEditOpen(false)} submitLabel="Save changes" />
      </Dialog>

      <ConfirmDialog
        open={isDeleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete this post?"
        description="It will disappear from your Library. Its link can be saved again afterwards."
        confirmLabel="Delete post"
        isConfirming={deletePost.isPending}
      />
    </article>
  );
}
