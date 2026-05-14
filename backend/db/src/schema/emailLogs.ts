import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { employeesTable } from "./employees";
import { newslettersTable } from "./newsletters";

export const emailLogsTable = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  employeeEmail: text("employee_email").notNull().references(() => employeesTable.employeeEmail),
  newsletterId: integer("newsletter_id").notNull().references(() => newslettersTable.id),
  deliveryStatus: text("delivery_status").notNull().default("pending"),
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  errorMessage: text("error_message"),
});

export const insertEmailLogSchema = createInsertSchema(emailLogsTable).omit({ id: true, sentAt: true });
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogsTable.$inferSelect;
