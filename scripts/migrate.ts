import { z } from "zod";
import { migrateDatabase } from "@/database/migrate";
import { migrateJobQueue } from "@/lib/jobs/queue";
import { databaseEnvFields } from "@/lib/config/runtime-env.mjs";

/**
 * The same path the worker takes at boot, so a migration applied by hand, by
 * CI, or by a deploying container is the identical operation. It stays as a
 * command because a release may still want to move the schema explicitly,
 * before any worker rolls.
 */
async function main(): Promise<void> {
  const env = z.object(databaseEnvFields(5)).parse(process.env);
  await migrateDatabase(env.DATABASE_URL, () =>
    migrateJobQueue({
      connectionString: env.JOB_DATABASE_URL ?? env.DATABASE_URL,
      poolSize: env.JOB_DB_POOL_SIZE,
    }),
  );

  console.log("Application and pg-boss migrations are up to date.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
