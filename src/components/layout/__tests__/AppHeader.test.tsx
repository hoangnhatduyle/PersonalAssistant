import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const pathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.value }));
// Each of these has its own tests; here they are markers for what the header holds and in what order.
vi.mock("@/components/search/SearchTrigger", () => ({ SearchTrigger: () => <button>search</button> }));
vi.mock("@/components/assistant/CallHeaderButton", () => ({ CallHeaderButton: () => <button>call</button> }));
vi.mock("@/components/assistant/CaptureQuickAction", () => ({ CaptureQuickAction: () => <button>capture</button> }));
vi.mock("@/components/auth/SignOutButton", () => ({ SignOutButton: () => <button>sign out</button> }));

const { AppHeader } = await import("../AppHeader");

describe("AppHeader", () => {
  beforeEach(() => {
    pathname.value = "/";
  });

  it("puts the call button beside quick capture, between search and sign-out", () => {
    render(<AppHeader email="me@example.com" />);
    const labels = screen.getAllByRole("button").map((button) => button.textContent);
    expect(labels).toEqual(["search", "call", "capture", "sign out"]);
  });

  it("shows who is signed in", () => {
    render(<AppHeader email="me@example.com" />);
    expect(screen.getByText(/me@example.com/)).toBeTruthy();
  });

  it("is hidden on Driving Mode, which has its own call and capture controls", () => {
    pathname.value = "/driving";
    const { container } = render(<AppHeader email="me@example.com" />);
    expect(container).toBeEmptyDOMElement();
  });
});
