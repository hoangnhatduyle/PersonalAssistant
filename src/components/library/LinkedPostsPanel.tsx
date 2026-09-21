import Link from "next/link";
import { PlatformBadge } from "@/components/library/PlatformBadge";
import type { LibraryEmployerDetail } from "@/lib/api/entity-types";

type Props = {
  employerId: string;
  posts: LibraryEmployerDetail["posts"];
};

/** Saved posts that mention this employer (linked from a post's edit form). */
export function LinkedPostsPanel({ employerId, posts }: Props) {
  return (
    <section aria-labelledby="employer-posts-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="employer-posts-heading" className="font-mono text-xs uppercase tracking-wide text-text-eyebrow">
          Saved posts
        </h2>
        {posts.length > 0 && (
          <Link href={`/library?employerId=${employerId}`} className="font-mono text-xs text-accent-indigo underline underline-offset-2 hover:text-text-primary">
            View in Posts
          </Link>
        )}
      </div>
      {posts.length === 0 ? (
        <p className="text-sm text-text-secondary">No saved posts mention this employer. Link one from a post&apos;s Edit dialog.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <li key={post.id} className="flex items-center justify-between gap-3 rounded-control border border-panel-border p-3">
              <Link href={`/library/posts/${post.id}`} className="min-w-0 truncate font-display text-sm font-semibold text-text-primary underline-offset-2 hover:underline">
                {post.title}
              </Link>
              <PlatformBadge platform={post.platform} className="shrink-0" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
