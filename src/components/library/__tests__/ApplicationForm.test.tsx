import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { ApplicationForm } from "@/components/library/ApplicationForm";
import { application } from "@/components/library/__tests__/fixtures";
import { ApiError } from "@/lib/http/client";

const EMPLOYER_ID = "33333333-3333-4333-8333-333333333333";
const useLibraryEmployers = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/useLibraryEmployers", () => ({ useLibraryEmployers }));

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("ApplicationForm", () => {
  const onSubmit = vi.fn();
  beforeEach(() => {
    onSubmit.mockReset().mockResolvedValue(undefined);
    useLibraryEmployers.mockReset().mockReturnValue({ data: { rows: [{ id: EMPLOYER_ID, name: "Acme Corp" }] }, isLoading: false });
  });

  it("asks for an employer and a role when none is fixed", async () => {
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText("Choose an employer")).toBeInTheDocument();
    expect(await screen.findByText("Give the role a title")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("hides the employer picker for a fixed employer and doesn't fetch the list", () => {
    renderWithProviders(<ApplicationForm employerId={EMPLOYER_ID} onSubmit={onSubmit} />);
    expect(screen.queryByLabelText("Employer")).not.toBeInTheDocument();
    expect(useLibraryEmployers).toHaveBeenCalledWith(expect.anything(), { enabled: false });
  });

  it("submits a parsed payload: numeric salary, upper-cased currency, tech stack, initial status", async () => {
    renderWithProviders(<ApplicationForm onSubmit={onSubmit} />);
    fill("Employer", EMPLOYER_ID);
    fill("Role", " Frontend Engineer ");
    fill("Work mode", "hybrid");
    fill("Minimum salary", "90000");
    fill("Maximum salary", "120000");
    fill("Currency", "usd");
    fill("Salary period", "year");
    fill("Status", "applied");
    const tagBox = screen.getByPlaceholderText("Add a technology…");
    fireEvent.change(tagBox, { target: { value: "TypeScript" } });
    fireEvent.keyDown(tagBox, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      employer_id: EMPLOYER_ID,
      title: "Frontend Engineer",
      job_url: null,
      work_mode: "hybrid",
      salary_min: 90000,
      salary_max: 120000,
      salary_currency: "USD",
      salary_period: "year",
      status: "applied",
      tech_stack: ["TypeScript"],
    });
  });

  it("blocks a max salary below the min", async () => {
    renderWithProviders(<ApplicationForm employerId={EMPLOYER_ID} onSubmit={onSubmit} />);
    fill("Role", "r");
    fill("Minimum salary", "100");
    fill("Maximum salary", "50");
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText("The maximum salary can't be below the minimum")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects a javascript: job link", async () => {
    renderWithProviders(<ApplicationForm employerId={EMPLOYER_ID} onSubmit={onSubmit} />);
    fill("Role", "r");
    fill("Job posting", "javascript:alert(1)");
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText("Enter a valid http(s) link")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("when editing: prefills, has no status field and no employer picker", () => {
    renderWithProviders(<ApplicationForm application={application("a1", { title: "SRE", salary_min: 5000, salary_currency: "EUR", work_mode: "remote" })} onSubmit={onSubmit} />);
    expect(screen.getByLabelText("Role")).toHaveValue("SRE");
    expect(screen.getByLabelText("Minimum salary")).toHaveValue(5000);
    expect(screen.getByLabelText("Work mode")).toHaveValue("remote");
    expect(screen.queryByLabelText("Status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Employer")).not.toBeInTheDocument();
  });

  it("shows an 'already tracked' notice on a 409", async () => {
    const duplicate = async () => {
      throw new ApiError("dup", 409, { existing_id: "app-1" });
    };
    renderWithProviders(<ApplicationForm employerId={EMPLOYER_ID} onSubmit={duplicate} />);
    fill("Role", "r");
    fill("Job posting", "https://jobs.example.com/1");
    fireEvent.click(screen.getByRole("button", { name: "Save role" }));
    expect(await screen.findByText(/already track this job/)).toBeInTheDocument();
  });
});
