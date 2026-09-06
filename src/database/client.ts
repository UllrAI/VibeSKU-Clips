import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { POOL_TIMING, utcConnectionOptions } from "./connection-options";
import * as tables from "./tables";

export interface DatabaseClientOptions {
  url: string;
  max: number;
  /** Serverless runtimes override these; everything else uses `POOL_TIMING`. */
  idleTimeout?: number;
  maxLifetime?: number;
  connectTimeout?: number;
  debug?: boolean;
}

export function createDatabaseClient(options: DatabaseClientOptions) {
  const sql = postgres(options.url, {
    max: options.max,
    idle_timeout: options.idleTimeout ?? POOL_TIMING.idleTimeout,
    max_lifetime: options.maxLifetime ?? POOL_TIMING.maxLifetime,
    connect_timeout: options.connectTimeout ?? POOL_TIMING.connectTimeout,
    debug: options.debug ?? false,
    ...utcConnectionOptions,
    onnotice: options.debug ? console.log : () => {},
  });

  return {
    db: drizzle(sql, { schema: { ...tables } }),
    sql,
    close: () => sql.end({ timeout: 5 }),
  };
}

export type AppDatabase = ReturnType<typeof createDatabaseClient>["db"];

type AppTransaction = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];
export type DatabaseExecutor = AppDatabase | AppTransaction;
