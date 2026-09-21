import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { EmployerForm } from "@/components/library/EmployerForm";
import { ApiError } from "@/lib/http/client";

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("EmployerForm", () => {
  const onSubmit = vi.fn();
  beforeEach(() => {
    onSubmit.mockReset().mockResolvedValue(undefined);
  });

  it("requires a name", async () => {
    renderWithProviders(<EmployerForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save employer" }));
    expect(await screen.findByText("Give the employer a name")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a javascript: website and never submits", async () => {
    renderWithProviders(<EmployerForm onSubmit={onSubmit} />);
    fill("Name", "Sneaky Inc");
    fill("Website", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "Save employer" }));
    expect(await screen.findByText("Enter a valid http(s) link")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a trimmed payload with blank links as null", async () => {
    renderWithProviders(<EmployerForm onSubmit={onSubmit} />);
    fill("Name", "  Acme Corp ");
    fill("Careers page", "https://acme.com/careers");
    fireEvent.click(screen.getByRole("button", { name: "Save employer" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ name: "Acme Corp", website: null, careers_url: "https://acme.com/careers" });
  });

  it("prefills when editing", () => {
    renderWithProviders(<EmployerForm employer={{ name: "Globex", website: "https://globex.io", careers_url: null, notes: "n" }} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Name")).toHaveValue("Globex");
    expect(screen.getByLabelText("Website")).toHaveValue("https://globex.io");
    expect(screen.getByLabelText("Careers page")).toHaveValue("");
  });

  it("shows 'Open it' when the name is already taken (409)", async () => {
    const duplicate = async () => {
      throw new ApiError("taken", 409, { existing_id: "emp-9" });
    };
    renderWithProviders(<EmployerForm onSubmit={duplicate} />);
    fill("Name", "Acme");
    fireEvent.click(screen.getByRole("button", { name: "Save employer" }));
    expect(await screen.findByText(/already track an employer/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open it" })).toHaveAttribute("href", "/library/employers/emp-9");
  });

  it("shows a generic error for other failures", async () => {
    const broken = async () => {
      throw new ApiError("Internal server error", 500);
    };
    renderWithProviders(<EmployerForm onSubmit={broken} />);
    fill("Name", "Acme");
    fireEvent.click(screen.getByRole("button", { name: "Save employer" }));
    expect(await screen.findByText("Internal server error")).toBeInTheDocument();
  });
});
