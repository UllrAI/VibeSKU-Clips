import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { utcConnectionOptions } from "./connection-options";

/**
 * Where drizzle-kit writes migrations and where the worker reads them back at
 * boot. Relative to the process working directory: the repository root
 * locally, `/app` in the runtime image, which copies this tree verbatim.
 */
const MIGRATIONS_FOLDER = "src/database/migrations";

/**
 * One classifier and one key, chosen once and never derived, so every process
 * competing to migrate this database asks for the same lock. The two-int form
 * keeps the value inside int4 rather than relying on bigint parameter binding.
 */
const MIGRATION_LOCK = { classifier: 842_133, key: 704_261 } as const;

/**
 * Apply every pending migration, then the queue schema.
 *
 * This runs from inside the deployment network with the credentials the
 * process already holds: no CI secret, no publicly reachable database port.
 * Drizzle records each file in `drizzle.__drizzle_migrations` and applies a
 * batch in one transaction, so a repeat boot is a no-op and a failed batch
 * leaves nothing half-applied.
 *
 * The advisory lock is what makes it safe for more than one caller. This
 * deployment runs a general worker and a render worker, and either may boot
 * first; the lock lets whichever arrives first do the work while the other
 * waits, instead of both racing the same DDL. It is held on a dedicated
 * single connection because an advisory lock belongs to its session, and a
 * pooled query could release it from a connection that never took it.
 */
export async function migrateDatabase(
  databaseUrl: string,
  applyQueueSchema: () => Promise<void>,
): Promise<void> {
  const sql = postgres(databaseUrl, {
    max: 1,
    onnotice: () => {},
    ...utcConnectionOptions,
  });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK.classifier}, ${MIGRATION_LOCK.key})`;
    try {
      await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
      await applyQueueSchema();
    } finally {
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK.classifier}, ${MIGRATION_LOCK.key})`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}
