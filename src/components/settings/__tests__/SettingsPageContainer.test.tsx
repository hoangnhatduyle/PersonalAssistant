import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

// Each card is stubbed to its own name: this test is about which cards the page
// shows and in which section, not about how a card works.
vi.mock("@/components/settings/TimeZoneCard", () => ({ TimeZoneCard: () => <div data-testid="card">Time zone</div> }));
vi.mock("@/components/settings/ReminderCadenceCard", () => ({ ReminderCadenceCard: () => <div data-testid="card">Reminder cadence</div> }));
vi.mock("@/components/settings/ReminderNotificationsCard", () => ({ ReminderNotificationsCard: () => <div data-testid="card">Reminder notifications</div> }));
vi.mock("@/components/settings/HandsFreeVoiceToggleCard", () => ({ HandsFreeVoiceToggleCard: () => <div data-testid="card">Hands-free voice</div> }));
vi.mock("@/components/settings/CallDiagnosticsToggleCard", () => ({ CallDiagnosticsToggleCard: () => <div data-testid="card">Call diagnostics</div> }));
vi.mock("@/components/settings/PeopleManagementCard", () => ({ PeopleManagementCard: () => <div data-testid="card">People management</div> }));
vi.mock("@/components/settings/AppUpdatesCard", () => ({ AppUpdatesCard: () => <div data-testid="card">App updates</div> }));

import { SettingsPageContainer } from "../SettingsPageContainer";

const cardsIn = (headingName: string) => {
  const section = screen.getByRole("heading", { name: headingName }).closest("section") as HTMLElement;
  return within(section).queryAllByTestId("card").map((node) => node.textContent);
};

describe("SettingsPageContainer", () => {
  it("groups time zone, reminders, voice and call diagnostics under Preferences, in that order", () => {
    render(<SettingsPageContainer />);
    expect(cardsIn("Preferences")).toEqual(["Time zone", "Reminder cadence", "Reminder notifications", "Hands-free voice", "Call diagnostics"]);
  });

  it("keeps only the app updates card under App", () => {
    render(<SettingsPageContainer />);
    expect(cardsIn("App")).toEqual(["App updates"]);
  });

  it("no longer carries a Knowledge section, which lives in the Library", () => {
    render(<SettingsPageContainer />);
    expect(screen.queryByRole("heading", { name: "Knowledge" })).toBeNull();
  });
});
