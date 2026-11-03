import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

const settings = vi.hoisted(() => ({ value: { hands_free_voice_enabled: false, speak_suggestions_aloud: false } as Record<string, unknown> }));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSettings: () => ({ mutateAsync, isPending: false }),
}));

import { HandsFreeVoiceToggleCard } from "../HandsFreeVoiceToggleCard";

describe("HandsFreeVoiceToggleCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({});
    settings.value = { hands_free_voice_enabled: false, speak_suggestions_aloud: false };
  });

  it("is the one voice-experience switch: it describes both the re-armed mic and the spoken suggestions", () => {
    renderWithProviders(<HandsFreeVoiceToggleCard />);
    expect(screen.getByText(/mic open after each spoken reply/i)).toBeTruthy();
    expect(screen.getByText(/read your suggestions aloud/i)).toBeTruthy();
  });

  it("turns hands-free and speak-suggestions on together", async () => {
    renderWithProviders(<HandsFreeVoiceToggleCard />);
    fireEvent.click(screen.getByRole("checkbox", { name: /hands-free voice/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ hands_free_voice_enabled: true, speak_suggestions_aloud: true }));
  });

  it("turns both off together", async () => {
    settings.value = { hands_free_voice_enabled: true, speak_suggestions_aloud: true };
    renderWithProviders(<HandsFreeVoiceToggleCard />);
    const box = screen.getByRole("checkbox", { name: /hands-free voice/i }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ hands_free_voice_enabled: false, speak_suggestions_aloud: false }));
  });

  it("follows hands-free alone for the checked state, so an old split value reads as a single setting", () => {
    settings.value = { hands_free_voice_enabled: false, speak_suggestions_aloud: true };
    renderWithProviders(<HandsFreeVoiceToggleCard />);
    expect((screen.getByRole("checkbox", { name: /hands-free voice/i }) as HTMLInputElement).checked).toBe(false);
  });
});
