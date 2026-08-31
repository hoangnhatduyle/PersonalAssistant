import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CitationChips } from "@/components/assistant/CitationChips";

describe("CitationChips", () => {
  it("links a citation with an http(s) originUrl, opening in a new tab safely", () => {
    render(
      <CitationChips
        citations={[{ sourceId: "src-1", title: "Syllabus PDF", originUrl: "https://example.com/syllabus.pdf" }]}
      />,
    );
    const link = screen.getByRole("link", { name: "Syllabus PDF" });
    expect(link).toHaveAttribute("href", "https://example.com/syllabus.pdf");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders plain text (no link) when originUrl is null", () => {
    render(<CitationChips citations={[{ sourceId: "src-1", title: "Pasted note", originUrl: null }]} />);
    expect(screen.getByText("Pasted note")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders plain text (no link) for an unsafe URL scheme", () => {
    render(<CitationChips citations={[{ sourceId: "src-1", title: "Malicious", originUrl: "javascript:alert(1)" }]} />);
    expect(screen.getByText("Malicious")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders nothing for an empty citation list", () => {
    const { container } = render(<CitationChips citations={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
