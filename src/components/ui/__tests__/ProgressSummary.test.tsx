import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProgressSummary } from "../ProgressSummary";

describe("ProgressSummary", () => {
  it("renders nothing when there is nothing to show", () => {
    const { container } = render(<ProgressSummary progress={{ percent: null, source: "none", note: null }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a bar, the percent, where it came from, the estimate and the note", () => {
    render(<ProgressSummary progress={{ percent: 60, source: "checklist", note: "just QA left" }} estimatedHours={4} />);
    expect(screen.getByRole("progressbar", { name: "Progress" })).toHaveAttribute("aria-valuenow", "60");
    expect(screen.getByText("60%")).toBeInTheDocument();
    expect(screen.getByText(/checklist/i)).toBeInTheDocument();
    expect(screen.getByText(/4 h/)).toBeInTheDocument();
    expect(screen.getByText("just QA left")).toBeInTheDocument();
  });

  it("labels a hand-set value as set by you", () => {
    render(<ProgressSummary progress={{ percent: 0, source: "manual", note: null }} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText(/set by you/i)).toBeInTheDocument();
  });

  it("still shows an estimate or a note when progress is unknown", () => {
    render(<ProgressSummary progress={{ percent: null, source: "none", note: "waiting on data" }} estimatedHours={2} />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.getByText(/2 h/)).toBeInTheDocument();
    expect(screen.getByText("waiting on data")).toBeInTheDocument();
  });
});
