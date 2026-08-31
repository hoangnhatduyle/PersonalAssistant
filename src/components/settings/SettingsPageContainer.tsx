import { VoiceCaptureToggleCard } from "@/components/settings/VoiceCaptureToggleCard";
import { ReminderCadenceCard } from "@/components/settings/ReminderCadenceCard";
import { QuietHoursCard } from "@/components/settings/QuietHoursCard";
import { KnowledgeSection } from "@/components/knowledge/KnowledgeSection";

export function SettingsPageContainer() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="preferences-heading" className="flex flex-col gap-4">
        <h2 id="preferences-heading" className="font-display text-lg font-semibold text-text-primary">
          Preferences
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReminderCadenceCard />
          <QuietHoursCard />
          <VoiceCaptureToggleCard />
        </div>
      </section>

      <section aria-labelledby="knowledge-heading" className="flex flex-col gap-4">
        <h2 id="knowledge-heading" className="font-display text-lg font-semibold text-text-primary">
          Knowledge
        </h2>
        <KnowledgeSection />
      </section>
    </div>
  );
}
