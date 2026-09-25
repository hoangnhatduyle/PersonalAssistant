import Image from "next/image";
import type { MailProvider } from "@/lib/mail/types";

const PROVIDER_ICON: Record<MailProvider, { src: string; alt: string }> = {
  google: { src: "/gmail.png", alt: "Gmail" },
  microsoft: { src: "/outlook.jpg", alt: "Outlook" },
};

/**
 * outlook.jpg has no alpha channel (its corners are a baked-in checkerboard
 * outside the circular glyph, not real transparency) — clipping it to a
 * circle crops that off since the glyph itself is circular. gmail.png
 * already has real transparency and its "M" mark spans edge-to-edge, so it
 * stays unmasked.
 */
const PROVIDER_MASK_CLASSES: Record<MailProvider, string> = {
  google: "",
  microsoft: "rounded-full",
};

type Props = {
  provider: MailProvider;
  size?: number;
  className?: string;
};

export function MailProviderIcon({ provider, size = 16, className }: Props) {
  const icon = PROVIDER_ICON[provider];
  return (
    <Image
      src={icon.src}
      alt={icon.alt}
      width={size}
      height={size}
      // gmail.png's native aspect ratio isn't square (wide canvas around
      // the "M" mark) — an explicit pixel style keeps the box exactly
      // size×size instead of Tailwind's `height: auto` img reset fighting
      // the width/height props (that mismatch is what Next.js warns about).
      style={{ width: size, height: size }}
      className={`shrink-0 object-contain ${PROVIDER_MASK_CLASSES[provider]} ${className ?? ""}`}
    />
  );
}
