import { getDb } from "./connection";
import { supportTickets } from "@db/schema";
import { desc, eq } from "drizzle-orm";

export async function findTicketsByUser(userId: string) {
  return getDb()
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))
    .orderBy(desc(supportTickets.createdAt));
}

export async function findAllTickets() {
  return getDb()
    .select()
    .from(supportTickets)
    .orderBy(desc(supportTickets.createdAt));
}

export async function createTicket(data: {
  userId?: string | null;
  userName: string;
  userEmail: string;
  subject: string;
  description?: string;
  category: "Billing" | "Execution" | "Connections" | "Strategies" | "Account";
  priority: "Urgent" | "High" | "Normal" | "Low";
}) {
  const [{ id }] = await getDb()
    .insert(supportTickets)
    .values({
      userId: data.userId ?? null,
      userName: data.userName,
      userEmail: data.userEmail,
      subject: data.subject,
      description: data.description ?? null,
      category: data.category,
      priority: data.priority,
    })
    .returning();
  return { id };
}

export async function setTicketStatus(
  id: string,
  status: "Open" | "In progress" | "Waiting on user" | "Resolved",
) {
  await getDb().update(supportTickets).set({ status }).where(eq(supportTickets.id, id));
}
