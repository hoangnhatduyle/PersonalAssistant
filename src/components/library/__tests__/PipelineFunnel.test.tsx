import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PipelineFunnel } from "@/components/library/PipelineFunnel";
import { StageStepper } from "@/components/library/StageStepper";
import { funnelCounts } from "@/lib/library/application-status";

const counts = funnelCounts([{ status: "applied" }, { status: "applied" }, { status: "interviewing" }, { status: "rejected" }]);

describe("PipelineFunnel", () => {
  it("describes the pipeline for assistive tech and shows every status with its count", () => {
    render(<PipelineFunnel counts={counts} />);
    expect(screen.getByRole("img", { name: "Pipeline: 2 applied, 1 interviewing, 1 rejected" })).toBeInTheDocument();
    const legend = screen.getByRole("list");
    expect(legend.textContent).toContain("Applied2");
    expect(legend.textContent).toContain("Offer0");
    expect(legend.textContent).toContain("Withdrawn0");
  });

  it("says so when there are no applications", () => {
    render(<PipelineFunnel counts={funnelCounts([])} />);
    expect(screen.getByRole("img", { name: "No applications yet" })).toBeInTheDocument();
  });

  it("is static without onSelect (no buttons)", () => {
    render(<PipelineFunnel counts={counts} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("legend toggles the status filter and marks the active one", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<PipelineFunnel counts={counts} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /Applied/ }));
    expect(onSelect).toHaveBeenLastCalledWith("applied");

    rerender(<PipelineFunnel counts={counts} activeStatus="applied" onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /Applied/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /Applied/ }));
    expect(onSelect).toHaveBeenLastCalledWith(undefined);
  });
});

describe("StageStepper", () => {
  it("labels the stage and its position among the four active stages", () => {
    render(<StageStepper status="interviewing" />);
    expect(screen.getByRole("img", { name: "Stage: Interviewing (3 of 4)" })).toBeInTheDocument();
  });

  it("labels closed applications without a position and shows the terminal marker", () => {
    render(<StageStepper status="rejected" />);
    const stepper = screen.getByRole("img", { name: "Stage: Rejected" });
    expect(stepper.textContent).toContain("✕");
  });
});
