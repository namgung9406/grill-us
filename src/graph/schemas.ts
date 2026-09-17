import { z } from "zod";

export const graphUserSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  accountEnabled: z.boolean(),
  userType: z.string().nullable(),
});

export const graphUsersPageSchema = z.object({
  value: z.array(graphUserSchema),
  "@odata.nextLink": z.string().url().optional(),
});

export type GraphUser = z.infer<typeof graphUserSchema>;