import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/render";
import { EventBlock } from "@/components/calendar/EventBlock";

// Unlike DayColumnEvents' test, this one needs the hover/focus handlers the
// real Link forwards to its anchor, so the stand-in passes them through.
vi.mock("next/link", () => ({
  default: ({ children, href, ...rest }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderBlock(overrides: Partial<React.ComponentProps<typeof EventBlock>> = {}) {
  return renderWithProviders(
    <EventBlock
      title="Structure, Defects and Diffusion"
      timeLabel="4 PM–4:30 PM"
      subtitle="McMaster Hall"
      topPx={0}
      heightPx={72}
      visibleHeightPx={72}
      leftPx={4}
      widthPx={100}
      stackIndex={0}
      stackSize={1}
      isElevated={false}
      tone="accent"
      href="/x"
      onElevate={() => {}}
      onOpenPicker={() => {}}
      {...overrides}
    />,
  );
}

describe("EventBlock detail level", () => {
  it("shows title, time, and location when there is room", () => {
    renderBlock();

    expect(screen.getByText("Structure, Defects and Diffusion")).toBeInTheDocument();
    expect(screen.getByText("4 PM–4:30 PM")).toBeInTheDocument();
    expect(screen.getByText("McMaster Hall")).toBeInTheDocument();
  });

  it("shows only the title, with a more-info hint, when the visible height is too small", () => {
    renderBlock({ heightPx: 36, visibleHeightPx: 36 });

    expect(screen.getByText("Structure, Defects and Diffusion")).toBeInTheDocument();
    expect(screen.queryByText("4 PM–4:30 PM")).not.toBeInTheDocument();
    expect(screen.queryByText("McMaster Hall")).not.toBeInTheDocument();
    expect(screen.getByText("⋯")).toBeInTheDocument();
  });

  it("treats a tall card as title-only when a stacked card covers most of it", () => {
    renderBlock({ heightPx: 72, visibleHeightPx: 12, stackIndex: 0, stackSize: 2 });

    expect(screen.queryByText("McMaster Hall")).not.toBeInTheDocument();
  });
});

describe("EventBlock hover card", () => {
  it("reveals time and location in a tooltip on hover of a title-only block, and hides it on leave", () => {
    renderBlock({ heightPx: 36, visibleHeightPx: 36 });
    const link = screen.getByRole("link");

    fireEvent.mouseEnter(link);
    const tooltip = screen.getByRole("tooltip");
    expect(tooltip).toHaveTextContent("4 PM–4:30 PM");
    expect(tooltip).toHaveTextContent("McMaster Hall");
    expect(link).toHaveAttribute("aria-describedby", tooltip.id);

    fireEvent.mouseLeave(link);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("also opens for keyboard focus", () => {
    renderBlock({ heightPx: 36, visibleHeightPx: 36 });
    const link = screen.getByRole("link");

    fireEvent.focus(link);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    fireEvent.blur(link);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("does not open for a block that already shows everything", () => {
    renderBlock();

    fireEvent.mouseEnter(screen.getByRole("link"));
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
