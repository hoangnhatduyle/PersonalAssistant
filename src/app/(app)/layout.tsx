import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { createClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { IconRail } from "@/components/layout/IconRail";
import { AppHeader } from "@/components/layout/AppHeader";
import { VoiceCaptureProvider } from "@/components/assistant/VoiceCaptureProvider";
import { CommandPalette } from "@/components/search/CommandPalette";
import { DrivingModePrompt } from "@/components/driving/DrivingModePrompt";

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
          <AppHeader email={user.email ?? ""} />
          <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
          <CommandPalette />
          <DrivingModePrompt />
        </div>
      </div>
    </VoiceCaptureProvider>
  );
}
