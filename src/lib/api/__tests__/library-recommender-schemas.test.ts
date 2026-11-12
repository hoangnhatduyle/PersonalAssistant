import { describe, expect, it } from "vitest";
import { libraryRecommenderLetterPatchSchema, libraryRecommenderLetterPayloadSchema, libraryRecommenderPayloadSchema } from "@/lib/api/library-schemas";

describe("library recommender schemas", () => {
  it("requires a name and trims it", () => {
    expect(libraryRecommenderPayloadSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(libraryRecommenderPayloadSchema.parse({ name: "  Dr. Mohsen " }).name).toBe("Dr. Mohsen");
  });

  it("rejects an unknown willingness status", () => {
    expect(libraryRecommenderPayloadSchema.safeParse({ name: "A", status: "maybe" }).success).toBe(false);
  });

  it("accepts a received letter with dates and treats blank dates as null", () => {
    const parsed = libraryRecommenderLetterPayloadSchema.parse({ purpose: "Siemens", status: "received", requested_on: "", received_on: "2026-03-04" });
    expect(parsed.requested_on).toBeNull();
    expect(parsed.received_on).toBe("2026-03-04");
  });

  it("requires a purpose and rejects malformed dates", () => {
    expect(libraryRecommenderLetterPayloadSchema.safeParse({ purpose: "" }).success).toBe(false);
    expect(libraryRecommenderLetterPayloadSchema.safeParse({ purpose: "x", received_on: "03/04/2026" }).success).toBe(false);
  });

  it("allows a partial patch", () => {
    expect(libraryRecommenderLetterPatchSchema.parse({ status: "received" })).toEqual({ status: "received" });
  });
});
