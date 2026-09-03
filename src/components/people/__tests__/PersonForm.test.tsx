import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { PersonForm } from "@/components/people/PersonForm";

describe("PersonForm", () => {
  it("rejects an empty name and never calls onSubmit", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PersonForm onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the zodResolver-parsed payload for a valid name, including the default color", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PersonForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Chau" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Chau" });
    expect(onSubmit.mock.calls[0][0].color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("submits relationship text entered by the user", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PersonForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Chau" } });
    fireEvent.change(screen.getByLabelText("Relationship"), { target: { value: "sister" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Chau", relationship: "sister" });
  });

  it("submits null when relationship is left blank", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<PersonForm onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Chau" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0].relationship).toBeNull();
  });

  it("cycles the default color by existingCount so successive additions don't collide", () => {
    renderWithProviders(<PersonForm existingCount={1} onSubmit={vi.fn()} />);
    const colorInput = screen.getByLabelText("Color") as HTMLInputElement;
    expect(colorInput.value.toLowerCase()).toBe("#ec4899");
  });

  it("pre-fills name, color, and relationship from an existing person for editing", () => {
    renderWithProviders(
      <PersonForm
        person={{
          id: "p-1",
          name: "Chau",
          color: "#22c55e",
          relationship: "sister",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          deleted_at: null,
          user_id: "u-1",
        }}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Name")).toHaveValue("Chau");
    expect((screen.getByLabelText("Color") as HTMLInputElement).value.toLowerCase()).toBe("#22c55e");
    expect(screen.getByLabelText("Relationship")).toHaveValue("sister");
  });
});
