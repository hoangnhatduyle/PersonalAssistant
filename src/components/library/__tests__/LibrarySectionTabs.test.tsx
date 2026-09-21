import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LibrarySectionTabs } from "@/components/library/LibrarySectionTabs";

const pathname = vi.hoisted(() => ({ value: "/library" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));

describe("LibrarySectionTabs", () => {
  it("offers Posts and Employers and marks the current section", () => {
    pathname.value = "/library";
    render(<LibrarySectionTabs />);
    expect(screen.getByRole("navigation", { name: "Library sections" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Posts" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Employers" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Employers" })).toHaveAttribute("href", "/library/employers");
  });

  it("marks Employers current on its own route", () => {
    pathname.value = "/library/employers";
    render(<LibrarySectionTabs />);
    expect(screen.getByRole("link", { name: "Employers" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Posts" })).not.toHaveAttribute("aria-current");
  });
});
