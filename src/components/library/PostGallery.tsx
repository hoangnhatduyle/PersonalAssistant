"use client";

import { useState, type KeyboardEvent } from "react";
import type { LibraryPostImage } from "@/lib/api/entity-types";
import { Button } from "@/components/ui/Button";
import { postImageSrc } from "@/components/library/PostCard";
import { computeTargetSize } from "@/lib/library/image-sizing";
import { FULL_MAX_EDGE, THUMB_MAX_EDGE } from "@/lib/library/constants";

type Props = {
  images: LibraryPostImage[];
  title: string;
  onDelete?: (image: LibraryPostImage) => void;
  isDeleting?: boolean;
};

/** Large viewer + thumbnail strip. Arrow keys move between screenshots when the viewer has focus. */
export function PostGallery({ images, title, onDelete, isDeleting = false }: Props) {
  const [requestedIndex, setIndex] = useState(0);
  if (images.length === 0) return null;

  // A deleted image can leave the requested index past the end; clamp instead of syncing state in an effect.
  const index = Math.min(requestedIndex, images.length - 1);
  const current = images[index];
  const size = computeTargetSize(current.width, current.height, FULL_MAX_EDGE);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setIndex((index + 1) % images.length);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setIndex((index - 1 + images.length) % images.length);
    }
  };

  return (
    <section aria-label={`Screenshots of ${title}`} className="flex flex-col gap-3">
      <div
        tabIndex={0}
        role="group"
        aria-roledescription="carousel"
        aria-label={`Screenshot ${index + 1} of ${images.length}`}
        onKeyDown={handleKeyDown}
        className="relative flex max-h-[70vh] items-center justify-center overflow-hidden rounded-panel border border-panel-border bg-bg-void-elevated outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-indigo"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the file route 302s to a signed Storage URL; next/image would need remotePatterns for a private, per-user URL. */}
        <img
          key={current.id}
          src={postImageSrc(current, "full")}
          alt={`Screenshot ${index + 1} of ${images.length} for ${title}`}
          width={size.width}
          height={size.height}
          decoding="async"
          className="max-h-[70vh] w-auto max-w-full object-contain"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {images.length > 1 ? (
          <ul className="flex flex-wrap gap-2" aria-label="Screenshot thumbnails">
            {images.map((image, position) => {
              const thumb = computeTargetSize(image.width, image.height, THUMB_MAX_EDGE);
              return (
                <li key={image.id}>
                  <button
                    type="button"
                    aria-label={`Show screenshot ${position + 1}`}
                    aria-current={position === index}
                    onClick={() => setIndex(position)}
                    className={`block overflow-hidden rounded-control border outline-offset-2 transition-opacity focus-visible:outline-2 focus-visible:outline-accent-indigo ${
                      position === index ? "border-accent-indigo" : "border-panel-border opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- see above */}
                    <img src={postImageSrc(image, "thumb")} alt="" width={thumb.width} height={thumb.height} loading="lazy" decoding="async" className="h-14 w-14 object-cover" />
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <span />
        )}
        {onDelete && (
          <Button variant="ghost" size="sm" disabled={isDeleting} onClick={() => onDelete(current)}>
            Remove this screenshot
          </Button>
        )}
      </div>
    </section>
  );
}
