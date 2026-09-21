import type { LibraryPlatform } from "@/lib/library/constants";

/** Platform glyphs drawn on a 24x24 grid; stroke-only so they take the card's platform edge colour. */
function PlatformGlyph({ platform }: { platform: LibraryPlatform }) {
  if (platform === "instagram") {
    return (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17" cy="7" r="0.6" fill="currentColor" />
      </>
    );
  }
  if (platform === "facebook") {
    return <path d="M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2H8v3.5h2.5V20H14v-6.5h2.4l.6-3.5H14V8.6c0-.4.2-.6.6-.6z" />;
  }
  return (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5S14.4 18.1 12 20.5C9.6 18.1 8.4 15.3 8.4 12S9.6 5.9 12 3.5z" />
    </>
  );
}

/**
 * Default cover for a post with no screenshots: a platform glyph over a soft
 * tinted grid, coloured by the card's `--library-edge` so Instagram/Facebook/Web
 * stay distinguishable at a glance. Decorative — the title is rendered below.
 */
export function DefaultPostCover({ platform }: { platform: LibraryPlatform }) {
  return (
    <div
      data-testid="default-post-cover"
      aria-hidden="true"
      className="relative flex h-full w-full items-center justify-center overflow-hidden text-[var(--library-edge)]"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--library-edge) 22%, transparent), transparent 70%), linear-gradient(to right, rgb(255 255 255 / 0.04) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.04) 1px, transparent 1px)",
        backgroundSize: "auto, 14px 14px, 14px 14px",
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-1/2 w-1/2 max-h-14 max-w-14 opacity-80"
      >
        <PlatformGlyph platform={platform} />
      </svg>
    </div>
  );
}
