import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/database";
import { ugcClips, ugcProducts, ugcTalents, ugcWorks } from "@/database/ugc";
import { taskRuns, users } from "@/database/schema";
import { requireAdmin } from "@/lib/auth/permissions";
import type { TaskRunStatus } from "@/lib/tasks/types";
import {
  deriveAdminWorkState,
  taskPayloadReferences,
  type AdminWorkState,
} from "./operations-state";

export type { AdminWorkState } from "./operations-state";

const ADMIN_TASK_STALL_MS = 45_000;

export interface AdminWorkListItem {
  id: string;
  title: string;
  owner: { id: string; name: string | null; email: string };
  productName: string | null;
  step: (typeof ugcWorks.$inferSelect)["step"];
  stepStatus: (typeof ugcWorks.$inferSelect)["stepStatus"];
  state: AdminWorkState;
  taskStatus: TaskRunStatus | null;
  taskStalled: boolean;
  videoModel: string;
  resolution: string;
  aspectRatio: string;
  clipReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AdminTaskListItem {
  id: string;
  kind: string;
  status: TaskRunStatus;
  scopeKey: string;
  owner: { id: string; name: string | null; email: string } | null;
  work: { id: string; title: string } | null;
  errorCode: string | null;
  attempt: number | null;
  providerJobId: string | null;
  progressStep: string | null;
  stalled: boolean;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

function progressStep(progress: Record<string, unknown> | null): string | null {
  return typeof progress?.step === "string" ? progress.step : null;
}

const workStateSql = sql<AdminWorkState>`case
  when ${ugcWorks.stepStatus} = 'failed' or ${taskRuns.status} in ('failed', 'cancelled') then 'failed'
  when ${taskRuns.status} in ('queued', 'running', 'waiting') then 'active'
  when ${ugcWorks.step} = 'done' then 'completed'
  else 'attention'
end`;

export async function getAdminWorks({
  page = 1,
  limit = 20,
  search = "",
  state = "all",
}: {
  page?: number;
  limit?: number;
  search?: string;
  state?: AdminWorkState | "all";
}): Promise<{ data: AdminWorkListItem[]; pagination: Pagination }> {
  await requireAdmin();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const conditions = [];
  const query = search.trim();

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(ugcWorks.title, pattern),
        ilike(ugcProducts.name, pattern),
        ilike(users.name, pattern),
        ilike(users.email, pattern),
        ilike(ugcClips.reference, pattern),
      ),
    );
  }
  if (state !== "all") conditions.push(eq(workStateSql, state));

  const where = conditions.length ? and(...conditions) : undefined;
  const base = db
    .select({
      id: ugcWorks.id,
      title: ugcWorks.title,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      productName: ugcProducts.name,
      step: ugcWorks.step,
      stepStatus: ugcWorks.stepStatus,
      taskStatus: taskRuns.status,
      taskCreatedAt: taskRuns.createdAt,
      videoModel: ugcWorks.videoModel,
      resolution: ugcWorks.resolution,
      aspectRatio: ugcWorks.aspectRatio,
      clipReference: ugcClips.reference,
      createdAt: ugcWorks.createdAt,
      updatedAt: ugcWorks.updatedAt,
    })
    .from(ugcWorks)
    .innerJoin(users, eq(users.id, ugcWorks.userId))
    .leftJoin(ugcProducts, eq(ugcProducts.id, ugcWorks.productId))
    .leftJoin(ugcClips, eq(ugcClips.id, ugcWorks.clipId))
    .leftJoin(taskRuns, eq(taskRuns.id, ugcWorks.taskRunId));

  const countBase = db
    .select({ total: count() })
    .from(ugcWorks)
    .innerJoin(users, eq(users.id, ugcWorks.userId))
    .leftJoin(ugcProducts, eq(ugcProducts.id, ugcWorks.productId))
    .leftJoin(ugcClips, eq(ugcClips.id, ugcWorks.clipId))
    .leftJoin(taskRuns, eq(taskRuns.id, ugcWorks.taskRunId));

  const [rows, [{ total }]] = await Promise.all([
    base
      .where(where)
      .orderBy(desc(ugcWorks.updatedAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit),
    countBase.where(where),
  ]);

  return {
    data: rows.map((row) => {
      const stateValue = deriveAdminWorkState(row);
      return {
        id: row.id,
        title: row.title,
        owner: {
          id: row.userId,
          name: row.userName,
          email: row.userEmail,
        },
        productName: row.productName,
        step: row.step,
        stepStatus: row.stepStatus,
        state: stateValue,
        taskStatus: row.taskStatus,
        taskStalled:
          row.taskStatus === "queued" &&
          Boolean(
            row.taskCreatedAt &&
            row.taskCreatedAt.getTime() < Date.now() - ADMIN_TASK_STALL_MS,
          ),
        videoModel: row.videoModel,
        resolution: row.resolution,
        aspectRatio: row.aspectRatio,
        clipReference: row.clipReference,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export async function getAdminTasks({
  page = 1,
  limit = 20,
  search = "",
  status = "all",
}: {
  page?: number;
  limit?: number;
  search?: string;
  status?: TaskRunStatus | "all" | "stalled";
}): Promise<{ data: AdminTaskListItem[]; pagination: Pagination }> {
  await requireAdmin();
  const safePage = Math.max(1, page);
  const safeLimit = Math.min(100, Math.max(1, limit));
  const conditions = [];
  const query = search.trim();

  if (query) {
    const pattern = `%${query}%`;
    conditions.push(
      or(
        ilike(sql<string>`${taskRuns.id}::text`, pattern),
        ilike(taskRuns.kind, pattern),
        ilike(taskRuns.scopeKey, pattern),
        ilike(taskRuns.providerJobId, pattern),
        ilike(sql<string>`${taskRuns.error}->>'code'`, pattern),
      ),
    );
  }
  if (status === "stalled") {
    conditions.push(
      and(
        eq(taskRuns.status, "queued"),
        sql`${taskRuns.createdAt} < now() - interval '45 seconds'`,
      ),
    );
  } else if (status !== "all") {
    conditions.push(eq(taskRuns.status, status));
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select()
      .from(taskRuns)
      .where(where)
      .orderBy(desc(taskRuns.createdAt))
      .limit(safeLimit)
      .offset((safePage - 1) * safeLimit),
    db.select({ total: count() }).from(taskRuns).where(where),
  ]);

  const references = rows.map((row) => taskPayloadReferences(row.input));
  const userIds = [
    ...new Set(
      references.flatMap((item) => (item.userId ? [item.userId] : [])),
    ),
  ];
  const workIds = [
    ...new Set(
      references.flatMap((item) => (item.workId ? [item.workId] : [])),
    ),
  ];
  const [owners, works] = await Promise.all([
    userIds.length
      ? db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : Promise.resolve([]),
    workIds.length
      ? db
          .select({ id: ugcWorks.id, title: ugcWorks.title })
          .from(ugcWorks)
          .where(inArray(ugcWorks.id, workIds))
      : Promise.resolve([]),
  ]);
  const ownersById = new Map(owners.map((owner) => [owner.id, owner]));
  const worksById = new Map(works.map((work) => [work.id, work]));

  return {
    data: rows.map((row, index) => {
      const reference = references[index]!;
      return {
        id: row.id,
        kind: row.kind,
        status: row.status,
        scopeKey: row.scopeKey,
        owner: reference.userId
          ? (ownersById.get(reference.userId) ?? null)
          : null,
        work: reference.workId
          ? (worksById.get(reference.workId) ?? null)
          : null,
        errorCode: row.error?.code ?? null,
        attempt: row.error?.attempt ?? null,
        providerJobId: row.providerJobId,
        progressStep: progressStep(row.progress),
        stalled:
          row.status === "queued" &&
          row.createdAt.getTime() < Date.now() - ADMIN_TASK_STALL_MS,
        createdAt: row.createdAt,
        startedAt: row.startedAt,
        completedAt: row.completedAt,
        updatedAt: row.updatedAt,
      };
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

export interface AdminOperationsStats {
  works: Record<"total" | AdminWorkState, number>;
  tasks: Record<TaskRunStatus | "stalled" | "failedLast24Hours", number>;
}

export async function getAdminOperationsStats(): Promise<AdminOperationsStats> {
  await requireAdmin();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const workCounts = await db
    .select({ state: workStateSql, value: count() })
    .from(ugcWorks)
    .leftJoin(taskRuns, eq(taskRuns.id, ugcWorks.taskRunId))
    .groupBy(workStateSql);
  const taskCounts = await db
    .select({ status: taskRuns.status, value: count() })
    .from(taskRuns)
    .groupBy(taskRuns.status);
  const [[{ totalWorks }], [{ stalled }], [{ failedLast24Hours }]] =
    await Promise.all([
      db.select({ totalWorks: count() }).from(ugcWorks),
      db
        .select({ stalled: count() })
        .from(taskRuns)
        .where(
          and(
            eq(taskRuns.status, "queued"),
            sql`${taskRuns.createdAt} < now() - interval '45 seconds'`,
          ),
        ),
      db
        .select({ failedLast24Hours: count() })
        .from(taskRuns)
        .where(
          and(
            inArray(taskRuns.status, ["failed", "cancelled"]),
            gte(taskRuns.updatedAt, yesterday),
          ),
        ),
    ]);

  const works: AdminOperationsStats["works"] = {
    total: totalWorks,
    active: 0,
    attention: 0,
    completed: 0,
    failed: 0,
  };
  for (const row of workCounts) works[row.state] = row.value;

  const tasks: AdminOperationsStats["tasks"] = {
    queued: 0,
    running: 0,
    waiting: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    stalled,
    failedLast24Hours,
  };
  for (const row of taskCounts) tasks[row.status] = row.value;

  return { works, tasks };
}

export async function getAdminWorkDetail(workId: string) {
  await requireAdmin();
  const [detail] = await db
    .select({
      work: ugcWorks,
      owner: { id: users.id, name: users.name, email: users.email },
      product: {
        id: ugcProducts.id,
        name: ugcProducts.name,
        status: ugcProducts.status,
      },
      talent: {
        id: ugcTalents.id,
        name: ugcTalents.name,
        status: ugcTalents.status,
      },
      clip: ugcClips,
    })
    .from(ugcWorks)
    .innerJoin(users, eq(users.id, ugcWorks.userId))
    .leftJoin(ugcProducts, eq(ugcProducts.id, ugcWorks.productId))
    .leftJoin(ugcTalents, eq(ugcTalents.id, ugcWorks.talentId))
    .leftJoin(ugcClips, eq(ugcClips.id, ugcWorks.clipId))
    .where(eq(ugcWorks.id, workId))
    .limit(1);
  if (!detail) return null;

  const [runs, versions] = await Promise.all([
    db
      .select()
      .from(taskRuns)
      .where(eq(taskRuns.scopeKey, `user:${detail.owner.id}:work:${workId}`))
      .orderBy(desc(taskRuns.createdAt)),
    db
      .select()
      .from(ugcClips)
      .where(eq(ugcClips.workId, workId))
      .orderBy(desc(ugcClips.version)),
  ]);

  return {
    ...detail,
    product: detail.product?.id ? detail.product : null,
    talent: detail.talent?.id ? detail.talent : null,
    clip: detail.clip?.id ? detail.clip : null,
    state: deriveAdminWorkState({
      step: detail.work.step,
      stepStatus: detail.work.stepStatus,
      taskStatus:
        runs.find((run) => run.id === detail.work.taskRunId)?.status ?? null,
    }),
    runs: runs.map((run) => ({
      id: run.id,
      kind: run.kind,
      status: run.status,
      errorCode: run.error?.code ?? null,
      attempt: run.error?.attempt ?? null,
      progressStep: progressStep(run.progress),
      providerJobId: run.providerJobId,
      stalled:
        run.status === "queued" &&
        run.createdAt.getTime() < Date.now() - ADMIN_TASK_STALL_MS,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      updatedAt: run.updatedAt,
    })),
    versions,
  };
}
