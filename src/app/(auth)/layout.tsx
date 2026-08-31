import type { ReactNode } from "react";
import { GlassPanel } from "@/components/ui/GlassPanel";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg-void px-4">
      <GlassPanel className="w-full max-w-sm p-8">
        <p className="mb-1 font-mono text-xs uppercase tracking-wide text-text-eyebrow">Personal Operations Console</p>
        <h1 className="mb-6 font-display text-2xl font-semibold text-text-primary">
          Your day, <span className="text-accent-indigo">in signal</span>
        </h1>
        {children}
      </GlassPanel>
    </main>
  );
}
