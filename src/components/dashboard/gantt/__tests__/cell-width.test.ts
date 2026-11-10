import { describe, expect, it } from "vitest";
import { fitCellWidth, labelColumnWidth } from "../cell-width";

const start = new Date(2026, 0, 1);
const daysLater = (days: number) => new Date(2026, 0, 1 + days);

describe("fitCellWidth", () => {
  it("falls back to a default before the pane is measured", () => {
    expect(fitCellWidth("day", start, daysLater(10), 0)).toBe(44);
    expect(fitCellWidth("week", start, daysLater(70), 0)).toBe(56);
  });

  it("makes the whole range fit the pane", () => {
    expect(fitCellWidth("day", start, daysLater(10), 300)).toBe(30);
  });

  it("does not stretch a short range into huge cells", () => {
    expect(fitCellWidth("day", start, daysLater(3), 600)).toBe(56);
  });

  it("never goes below a readable minimum, so a long range scrolls instead", () => {
    expect(fitCellWidth("day", start, daysLater(60), 300)).toBe(26);
  });

  it("counts weeks, not days, for the week scale", () => {
    expect(fitCellWidth("week", start, daysLater(56), 400)).toBe(50);
  });
});

describe("labelColumnWidth", () => {
  it("uses a default before the card is measured", () => {
    expect(labelColumnWidth(0)).toBe(112);
  });

  it("takes about a third of the card, leaving the bars the larger share", () => {
    expect(labelColumnWidth(430)).toBe(146);
  });

  it("stays within readable limits at both extremes", () => {
    expect(labelColumnWidth(207)).toBe(84);
    expect(labelColumnWidth(900)).toBe(156);
  });
});
