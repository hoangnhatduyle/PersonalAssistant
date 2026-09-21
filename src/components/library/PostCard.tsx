import Link from "next/link";
import type { LibraryPostImage, LibraryPostWithRelations } from "@/lib/api/entity-types";
import { computeTargetSize } from "@/lib/library/image-sizing";
import { THUMB_MAX_EDGE } from "@/lib/library/constants";
import { displayHost } from "@/lib/library/url";
import { platformLabel } from "@/components/library/PlatformBadge";
import { DefaultPostCover } from "@/components/library/DefaultPostCover";

const MAX_LAYERS = 3;
const VISIBLE_TAGS = 3;

export function postImageSrc(image: Pick<LibraryPostImage, "id">, size: "thumb" | "full"): string {
  return `/api/library/post-images/${image.id}/file?size=${size}`;
}

function formatSaved(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type Props = {
  post: LibraryPostWithRelations;
};

/** One compact saved post: stacked-layer cover (depth ~ screenshot count; a platform default cover when there are none), mono eyebrow, display title, tags. Favorites carry a star. */
export function PostCard({ post }: Props) {
  const cover = post.images[0];
  const layers = Math.min(post.images.length, MAX_LAYERS) - 1;
  const host = displayHost(post.url);
  const eyebrow = [platformLabel(post.platform), host && host !== `${post.platform}.com` ? host : null, formatSaved(post.created_at)]
    .filter(Boolean)
    .join(" · ");
  const thumbSize = cover ? computeTargetSize(cover.width, cover.height, THUMB_MAX_EDGE) : null;

  return (
    <article
      data-platform={post.platform}
      data-favorite={post.is_favorite || undefined}
      className={`library-card group flex flex-col gap-2 rounded-panel border p-2.5 ${post.archived_at ? "opacity-70" : ""}`}
    >
      <div className="relative aspect-[4/3]">
        {Array.from({ length: Math.max(layers, 0) }, (_, index) => (
          <span key={index} aria-hidden="true" className="library-layer" data-depth={Math.max(layers, 0) - index} />
        ))}
        <div className="relative h-full w-full overflow-hidden rounded-control border border-panel-border bg-bg-void-elevated">
          {cover && thumbSize ? (
            // eslint-disable-next-line @next/next/no-img-element -- the file route 302s to a signed Storage URL; next/image would need remotePatterns + an optimizer round trip for a private, per-user URL.
            <img
              src={postImageSrc(cover, "thumb")}
              alt=""
              width={thumbSize.width}
              height={thumbSize.height}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          ) : (
            <DefaultPostCover platform={post.platform} />
          )}
        </div>
        {post.is_favorite && (
          <span
            role="img"
            aria-label="Favorite"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-bg-void/80 text-status-warn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </span>
        )}
        {post.images.length > 1 && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-bg-void/80 px-1.5 py-0.5 font-mono text-[0.65rem] text-text-secondary">
            {post.images.length} shots
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <p className="truncate font-mono text-[0.65rem] uppercase tracking-wide text-text-eyebrow">
          {eyebrow}
          {post.archived_at ? " · archived" : ""}
        </p>
        <h3 className="font-display text-sm font-semibold leading-snug text-text-primary">
          <Link
            href={`/library/posts/${post.id}`}
            className="line-clamp-2 rounded-control outline-offset-4 after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-accent-indigo"
          >
            {post.title}
          </Link>
        </h3>
        {post.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1" aria-label="Tags">
            {post.tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <li key={tag} className="rounded-full border border-panel-border px-1.5 py-px font-mono text-[0.65rem] text-text-secondary">
                {tag}
              </li>
            ))}
            {post.tags.length > VISIBLE_TAGS && (
              <li className="px-1 py-px font-mono text-[0.65rem] text-text-eyebrow">+{post.tags.length - VISIBLE_TAGS}</li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
