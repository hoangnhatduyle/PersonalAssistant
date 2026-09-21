import Link from "next/link";
import type { LibraryPostImage, LibraryPostWithRelations } from "@/lib/api/entity-types";
import { computeTargetSize } from "@/lib/library/image-sizing";
import { THUMB_MAX_EDGE } from "@/lib/library/constants";
import { displayHost } from "@/lib/library/url";
import { platformLabel } from "@/components/library/PlatformBadge";

const MAX_LAYERS = 3;
const VISIBLE_TAGS = 3;

export function postImageSrc(image: Pick<LibraryPostImage, "id">, size: "thumb" | "full"): string {
  return `/api/library/post-images/${image.id}/file?size=${size}`;
}

function formatSaved(createdAt: string): string {
  return new Date(createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** No screenshot: a typographic cover so the card still has a face. */
function TypographicCover({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-end overflow-hidden rounded-control bg-gradient-to-br from-white/[0.06] to-transparent p-3">
      <span aria-hidden="true" className="line-clamp-3 font-display text-2xl font-semibold leading-tight text-text-secondary/60">
        {title}
      </span>
    </div>
  );
}

type Props = {
  post: LibraryPostWithRelations;
};

/** One saved post: stacked-layer cover (depth ~ screenshot count), mono eyebrow, display title, tags. Favorites take a wider cell. */
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
      className={`library-card group flex flex-col gap-3 rounded-panel border p-4 ${post.is_favorite ? "lg:col-span-2 lg:flex-row lg:gap-5" : ""} ${
        post.archived_at ? "opacity-70" : ""
      }`}
    >
      <div className={`relative aspect-[4/3] ${post.is_favorite ? "lg:w-[58%] lg:shrink-0" : ""}`}>
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
            <TypographicCover title={post.title} />
          )}
        </div>
        {post.is_favorite && (
          <span
            role="img"
            aria-label="Favorite"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-bg-void/80 text-status-warn"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
              <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
            </svg>
          </span>
        )}
        {post.images.length > 1 && (
          <span className="absolute bottom-2 left-2 rounded-full bg-bg-void/80 px-2 py-0.5 font-mono text-[0.7rem] text-text-secondary">
            {post.images.length} shots
          </span>
        )}
      </div>

      <div className={`flex min-w-0 flex-col gap-1.5 ${post.is_favorite ? "lg:flex-1 lg:justify-end lg:pb-1" : ""}`}>
        <p className="truncate font-mono text-[0.7rem] uppercase tracking-wide text-text-eyebrow">
          {eyebrow}
          {post.archived_at ? " · archived" : ""}
        </p>
        <h3 className={`font-display font-semibold leading-snug text-text-primary ${post.is_favorite ? "text-xl lg:text-2xl" : "text-base"}`}>
          <Link
            href={`/library/posts/${post.id}`}
            className="line-clamp-2 rounded-control outline-offset-4 after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:outline-accent-indigo"
          >
            {post.title}
          </Link>
        </h3>
        {post.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
            {post.tags.slice(0, VISIBLE_TAGS).map((tag) => (
              <li key={tag} className="rounded-full border border-panel-border px-2 py-0.5 font-mono text-[0.7rem] text-text-secondary">
                {tag}
              </li>
            ))}
            {post.tags.length > VISIBLE_TAGS && (
              <li className="px-1 py-0.5 font-mono text-[0.7rem] text-text-eyebrow">+{post.tags.length - VISIBLE_TAGS}</li>
            )}
          </ul>
        )}
      </div>
    </article>
  );
}
