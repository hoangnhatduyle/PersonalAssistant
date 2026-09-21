import { Badge } from "@/components/ui/Badge";
import { PLATFORM_TONE } from "@/lib/status-colors";
import type { LibraryPlatform } from "@/lib/library/constants";

const LABELS: Record<LibraryPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  other: "Web",
};

export function platformLabel(platform: LibraryPlatform): string {
  return LABELS[platform];
}

export function PlatformBadge({ platform, className = "" }: { platform: LibraryPlatform; className?: string }) {
  return (
    <Badge tone={PLATFORM_TONE[platform]} className={className}>
      {LABELS[platform]}
    </Badge>
  );
}
