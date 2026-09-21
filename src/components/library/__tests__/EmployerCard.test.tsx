import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmployerCard } from "@/components/library/EmployerCard";
import { employer } from "@/components/library/__tests__/fixtures";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const app = (id: string, status: "interested" | "applied" | "interviewing" | "offer" | "rejected" | "withdrawn", changed = "2026-09-10T12:00:00.000Z") => ({
  id,
  title: `Role ${id}`,
  status,
  status_changed_at: changed,
});

describe("EmployerCard", () => {
  it("shows the name as the link to the dossier, with host, role and contact counts", () => {
    render(
      <EmployerCard
        employer={employer({ applications: [app("a", "applied")], contacts: [{ person: { id: "p", name: "Sam" }, kind: "recruiter", note: "" }] })}
        now={NOW}
      />,
    );
    expect(screen.getByRole("link", { name: "Acme Corp" })).toHaveAttribute("href", "/library/employers/e1");
    expect(screen.getByText(/acme\.com · 1 role · 1 contact/)).toBeInTheDocument();
  });

  it("summarises by the most advanced active application and shows days in that stage", () => {
    render(<EmployerCard employer={employer({ applications: [app("b", "interviewing", "2026-09-13T12:00:00.000Z"), app("a", "applied")] })} now={NOW} />);
    expect(screen.getByText("Interviewing", { selector: "span" })).toBeInTheDocument();
    expect(screen.getByText("7d in interviewing")).toBeInTheDocument();
    const roles = screen.getByRole("list", { name: "Roles at Acme Corp" });
    expect(within(roles).getAllByRole("img").map((node) => node.getAttribute("aria-label"))).toEqual([
      "Stage: Interviewing (3 of 4)",
      "Stage: Applied (2 of 4)",
    ]);
  });

  it("is honest when nothing is tracked yet", () => {
    render(<EmployerCard employer={employer()} now={NOW} />);
    expect(screen.getByText("Nothing tracked here yet.")).toBeInTheDocument();
    expect(screen.getByText(/No roles yet/)).toBeInTheDocument();
  });

  it("collapses long role lists and mutes a card whose applications are all closed", () => {
    const many = ["a", "b", "c", "d", "e"].map((id) => app(id, "rejected"));
    const { container } = render(<EmployerCard employer={employer({ applications: many })} now={NOW} />);
    expect(screen.getByText("+2 more")).toBeInTheDocument();
    expect(container.querySelector("article")).toHaveAttribute("data-muted", "true");
    expect(screen.queryByText(/in rejected/)).not.toBeInTheDocument();
  });

  it("flags archived employers", () => {
    render(<EmployerCard employer={employer({ archived_at: "2026-09-01T00:00:00.000Z" })} now={NOW} />);
    expect(screen.getByText(/archived/)).toBeInTheDocument();
  });
});
