import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";

const settings = vi.hoisted(() => ({ value: { voice_persona: "classic" } as Record<string, unknown> }));
const mutateAsync = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useSettings", () => ({
  useSettings: () => ({ data: settings.value, isLoading: false, isError: false, refetch: vi.fn() }),
  useUpdateSettings: () => ({ mutateAsync, isPending: false }),
}));

const audio = vi.hoisted(() => ({ instances: [] as Array<{ src: string; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn>; onended: (() => void) | null; onerror: (() => void) | null }> }));

import { VoicePersonaCard } from "../VoicePersonaCard";

describe("VoicePersonaCard", () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({});
    settings.value = { voice_persona: "classic" };
    audio.instances = [];
    vi.stubGlobal(
      "Audio",
      class {
        src = "";
        onended: (() => void) | null = null;
        onerror: (() => void) | null = null;
        pause = vi.fn();
        play = vi.fn().mockResolvedValue(undefined);
        constructor() {
          audio.instances.push(this);
        }
      },
    );
  });

  it("lists every preset and marks the saved one as selected", () => {
    renderWithProviders(<VoicePersonaCard />);
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect((screen.getByRole("radio", { name: /classic/i }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: /jarvis/i }) as HTMLInputElement).checked).toBe(false);
  });

  it("saves the chosen preset's id", async () => {
    renderWithProviders(<VoicePersonaCard />);
    fireEvent.click(screen.getByRole("radio", { name: /jarvis/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ voice_persona: "jarvis" }));
  });

  it("does not save again when the current preset is picked", () => {
    renderWithProviders(<VoicePersonaCard />);
    fireEvent.click(screen.getByRole("radio", { name: /classic/i }));
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("says the change applies from the next call", () => {
    renderWithProviders(<VoicePersonaCard />);
    expect(screen.getByText(/next call/i)).toBeTruthy();
  });

  it("plays a preset's pre-rendered sample without selecting it, and stops it on a second press", () => {
    renderWithProviders(<VoicePersonaCard />);
    fireEvent.click(screen.getByRole("button", { name: /play jarvis sample/i }));
    expect(audio.instances[0].src).toBe("/voice-samples/jarvis.mp3");
    expect(audio.instances[0].play).toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /stop jarvis sample/i }));
    expect(audio.instances[0].pause).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: /play jarvis sample/i })).toBeTruthy();
  });

  it("switches the one shared player when another sample is started", () => {
    renderWithProviders(<VoicePersonaCard />);
    fireEvent.click(screen.getByRole("button", { name: /play jarvis sample/i }));
    fireEvent.click(screen.getByRole("button", { name: /play coach sample/i }));
    expect(audio.instances).toHaveLength(1);
    expect(audio.instances[0].src).toBe("/voice-samples/coach.mp3");
    expect(screen.getByRole("button", { name: /play jarvis sample/i })).toBeTruthy();
  });
});
