import { z } from "zod";

// Jedno źródło prawdy o kształcie odbiorcy — używane przez API routes i formularz.
export const recipientSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).optional(),
  status: z.enum(["active", "unsubscribed"]).default("active"),
});

export type RecipientInput = z.infer<typeof recipientSchema>;
