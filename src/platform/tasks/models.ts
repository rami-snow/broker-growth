import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";

export type TaskId = `task_${string}`;
export const taskPriorities = ["Low", "Normal", "High"] as const;
export type TaskPriority = (typeof taskPriorities)[number];
export const taskStatuses = ["Open", "Completed", "Cancelled"] as const;
export type TaskStatus = (typeof taskStatuses)[number];
export interface Task {
  id: TaskId;
  organisationId: OrganisationId;
  leadId?: LeadId;
  subjectReference?: { type: string; id: string };
  assignedMembershipId: MembershipId;
  title: string;
  dueAt: string;
  priority: TaskPriority;
  status: TaskStatus;
  version: number;
  createdBy: MembershipId;
  createdAt: string;
}
export type NewTaskInput = Pick<Task, "assignedMembershipId" | "title" | "dueAt" | "priority"> & { leadId: LeadId };
