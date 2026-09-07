"use server";

import {
  getAdminTasks,
  getAdminWorks,
  type AdminWorkState,
} from "@/lib/admin/operations";
import type { TaskRunStatus } from "@/lib/tasks/types";

export async function queryAdminWorks(input: {
  page?: number;
  limit?: number;
  search?: string;
  state?: AdminWorkState | "all";
}) {
  return getAdminWorks(input);
}

export async function queryAdminTasks(input: {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskRunStatus | "all" | "stalled";
}) {
  return getAdminTasks(input);
}
