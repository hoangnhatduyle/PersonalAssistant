import { HandsFreeVoiceToggleCard } from "@/components/settings/HandsFreeVoiceToggleCard";
import { ReminderCadenceCard } from "@/components/settings/ReminderCadenceCard";
import { ReminderNotificationsCard } from "@/components/settings/ReminderNotificationsCard";
import { PeopleManagementCard } from "@/components/settings/PeopleManagementCard";
import { AppUpdatesCard } from "@/components/settings/AppUpdatesCard";
import { CallDiagnosticsToggleCard } from "@/components/settings/CallDiagnosticsToggleCard";

export function SettingsPageContainer() {
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="preferences-heading" className="flex flex-col gap-4">
        <h2 id="preferences-heading" className="font-display text-lg font-semibold text-text-primary">
          Preferences
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <ReminderCadenceCard />
          <ReminderNotificationsCard />
          <HandsFreeVoiceToggleCard />
          <CallDiagnosticsToggleCard />
        </div>
      </section>

      <section aria-labelledby="people-heading" className="flex flex-col gap-4">
        <h2 id="people-heading" className="font-display text-lg font-semibold text-text-primary">
          People
        </h2>
        <PeopleManagementCard />
      </section>

      <section aria-labelledby="app-heading" className="flex flex-col gap-4">
        <h2 id="app-heading" className="font-display text-lg font-semibold text-text-primary">
          App
        </h2>
        <AppUpdatesCard />
      </section>
    </div>
  );
}
