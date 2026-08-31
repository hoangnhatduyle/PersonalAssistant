import { z } from "zod";

// Not one of the entity schemas in src/lib/api/schemas.ts — auth credentials
// aren't a domain entity, and Supabase Auth itself enforces the real rules
// server-side. This is client-side UX validation only.
export const authCredentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthCredentials = z.infer<typeof authCredentialsSchema>;
