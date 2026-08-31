import { SignalInbox } from "@/components/reminders/SignalInbox";
import { CaptureChannel } from "@/components/assistant/CaptureChannel";

export function DispatchPageContainer() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section aria-labelledby="signal-inbox-heading" className="flex flex-col gap-3">
        <h2 id="signal-inbox-heading" className="font-display text-lg font-semibold text-text-primary">
          Signal inbox
        </h2>
        <SignalInbox />
      </section>
      <section aria-labelledby="capture-channel-heading" className="flex flex-col gap-3">
        <h2 id="capture-channel-heading" className="font-display text-lg font-semibold text-text-primary">
          Capture channel
        </h2>
        <CaptureChannel />
      </section>
    </div>
  );
}
