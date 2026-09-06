import type { z } from "zod";
import type { AppDatabase } from "@/database/client";

export interface JobHandlerContext<Payload = unknown> {
  /** Handlers run in the standalone worker, which owns the only pool available. */
  db: AppDatabase;
  taskRunId: string;
  scopeKey: string;
  attempt: number;
  providerIdempotencyKey: string;
  signal: AbortSignal;
  isCancelled(): Promise<boolean>;
  /**
   * One structured line on the worker's stdout, tagged with the job and its
   * task run. Handlers use it to say what they decided; the queue already logs
   * start, finish and failure, so this is for the steps in between.
   */
  log(event: string, data?: Record<string, unknown>): void;
  updateProgress(progress: Record<string, unknown>): Promise<boolean>;
  scheduleContinuation(
    payload: Payload,
    startAfter: Date | number,
  ): Promise<boolean>;
  submitProviderJob(
    submit: (input: { idempotencyKey: string }) => Promise<string>,
  ): Promise<string>;
}

export interface JobDefinition<
  Name extends string,
  Schema extends z.ZodType,
  Result = unknown,
> {
  name: Name;
  schema: Schema;
  handler: (
    payload: z.infer<Schema>,
    context: JobHandlerContext<z.infer<Schema>>,
  ) => Promise<Result>;
  queue: {
    retryLimit: number;
    retryDelay: number;
    retryBackoff: boolean;
    expireInSeconds: number;
  };
  localConcurrency: number;
  groupConcurrency: number;
}

export function defineJob<
  const Name extends string,
  Schema extends z.ZodType,
  Result = unknown,
>(
  name: Name,
  schema: Schema,
  handler: JobDefinition<Name, Schema, Result>["handler"],
  options?: Partial<
    Pick<
      JobDefinition<Name, Schema, Result>,
      "queue" | "localConcurrency" | "groupConcurrency"
    >
  >,
): JobDefinition<Name, Schema, Result> {
  return {
    name,
    schema,
    handler,
    queue: options?.queue ?? {
      retryLimit: 3,
      retryDelay: 2,
      retryBackoff: true,
      expireInSeconds: 15 * 60,
    },
    localConcurrency: options?.localConcurrency ?? 4,
    groupConcurrency: options?.groupConcurrency ?? 1,
  };
}

export class PermanentJobError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "PermanentJobError";
    this.code = code;
  }
}
