"use client";

import { usePathname } from "next/navigation";
import { SearchTrigger } from "@/components/search/SearchTrigger";
import { CaptureQuickAction } from "@/components/assistant/CaptureQuickAction";
import { SignOutButton } from "@/components/auth/SignOutButton";

type Props = {
  email: string;
};

/** Hidden on the Driving Mode hub, which renders its own full-screen chrome. */
export function AppHeader({ email }: Props) {
  const pathname = usePathname();
  if (pathname.startsWith("/driving")) return null;

  return (
    <header className="flex items-center justify-between border-b border-panel-border bg-bg-void-elevated py-3 pl-16 pr-6 md:px-6">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-status-ok" aria-hidden="true" />
        <span className="hidden text-xs uppercase tracking-wide text-text-eyebrow md:inline">
          Signed in as {email}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <SearchTrigger />
        <CaptureQuickAction />
        <SignOutButton />
      </div>
    </header>
  );
}
