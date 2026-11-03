import { z } from "zod";

/**
 * Body of POST /api/push/subscribe: the browser's PushSubscription.toJSON().
 * The endpoint must be https -- every real push service is, and it is the URL
 * the server will later POST to, so a non-https one is never legitimate.
 */
export const pushSubscribeBodySchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        return new URL(value).protocol === "https:";
      } catch {
        return false;
      }
    }, "endpoint must be an https URL"),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(256),
  }),
});

export const pushUnsubscribeBodySchema = z.object({
  endpoint: z.string().min(1).max(2048),
});

export type PushSubscribeBody = z.infer<typeof pushSubscribeBodySchema>;
