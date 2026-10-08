import { z } from "zod";
import { mailProviderSchema } from "@/lib/api/schemas";
import { TRIAGE_MAX_DAYS, TRIAGE_MIN_DAYS } from "@/lib/email-triage/constants";

export const triageRunPayloadSchema = z.object({
  provider: mailProviderSchema,
  days: z.number().int().min(TRIAGE_MIN_DAYS).max(TRIAGE_MAX_DAYS).optional(),
});
export type TriageRunPayload = z.infer<typeof triageRunPayloadSchema>;

export const triageListQuerySchema = z.object({
  provider: mailProviderSchema.optional(),
  scope: z.enum(["open", "all"]).default("open"),
});

export const triageItemUpdateSchema = z.object({
  status: z.enum(["dismissed", "acted"]),
});
export type TriageItemUpdatePayload = z.infer<typeof triageItemUpdateSchema>;
