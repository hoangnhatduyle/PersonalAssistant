import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { IconRail } from "@/components/layout/IconRail";
import { SignOutButton } from "@/components/auth/SignOutButton";
import { VoiceCaptureProvider } from "@/components/assistant/VoiceCaptureProvider";
import { CaptureQuickAction } from "@/components/assistant/CaptureQuickAction";

/**
 * Defense-in-depth alongside src/proxy.ts's redirect: proxy.ts already
 * guards every non-public path, but this layout verifies the session itself
 * too rather than trusting the matcher config never regresses — matches
 * this codebase's existing "never trust one layer" pattern
 * (requireAuthenticatedContext does the same for API routes).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const user = await getAuthenticatedUser(supabase);
  if (!user) redirect("/sign-in");

  return (
    <VoiceCaptureProvider>
      <div className="flex min-h-screen">
        <IconRail email={user.email ?? ""} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b border-panel-border bg-bg-void-elevated py-3 pl-16 pr-6 md:px-6">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-status-ok" aria-hidden="true" />
              <span className="hidden font-mono text-xs uppercase tracking-wide text-text-eyebrow md:inline">
                Signed in as {user.email}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <CaptureQuickAction />
              <SignOutButton />
            </div>
          </header>
          <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
        </div>
      </div>
    </VoiceCaptureProvider>
  );
}
