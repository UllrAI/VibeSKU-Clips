import { createDatabaseClient } from "@/database/client";
import { createAiModels } from "@/lib/ai/models.node";
import { finalizePendingAiRuns } from "@/lib/ai/finalize";
import { createFileStorage } from "@/lib/uploads/store";
import { createUploadRepository } from "@/lib/uploads/repository";
import { cleanupDeletedFiles } from "@/lib/uploads/deletion";
import { buildFileUrl } from "@/lib/uploads/url";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { JobQueue, migrateJobQueue } from "@/lib/jobs/queue";
import { jobDefinitions } from "@/lib/jobs/catalog";
import { loadWorkerEnv } from "@/lib/jobs/worker-env";
import { migrateDatabase } from "@/database/migrate";
import { probeMediaToolchain } from "@/lib/ugc/media/toolchain";

async function main(): Promise<void> {
  const workerEnv = loadWorkerEnv();
  const database = createDatabaseClient({
    url: workerEnv.DATABASE_URL,
    max: workerEnv.DB_POOL_SIZE,
  });

  if (workerEnv.WORKER_ROLE === "general") {
    createAiModels({
      apiKey: workerEnv.LLM_API_KEY,
      baseUrl: workerEnv.LLM_BASE_URL,
      defaultModel: workerEnv.AI_DEFAULT_MODEL,
    });
  }

  // A render worker without the filters composition uses would accept work and
  // fail on the last step, after every shot has been generated and paid for.
  if (workerEnv.WORKER_ROLE === "render") {
    const toolchain = await probeMediaToolchain();
    if (toolchain.state !== "ready") {
      throw new Error(
        `Render worker media toolchain is unusable: ${toolchain.detail}`,
      );
    }
    console.log(
      JSON.stringify({
        component: "job-worker",
        event: "media_toolchain_ready",
        ffmpeg: toolchain.ffmpegVersion,
        ffprobe: toolchain.ffprobeVersion,
        // Null means linked references cannot be fetched on this image;
        // uploaded ones still work, so this is a note, not a failure.
        downloader: toolchain.downloaderVersion,
      }),
    );
  }

  // Artifact check only: it proves the bundle loads and, for the render role,
  // that the image carries its media tools. It reaches no database, so it runs
  // before migration rather than after it.
  if (process.env.WORKER_SMOKE_TEST === "1") {
    await database.close();
    console.log("Worker artifact smoke test passed.");
    return;
  }

  // The schema moves here, before anything claims a queue, and never from the
  // web process. A worker already sits inside the deployment network holding
  // database credentials, so a release needs no CI secret and no publicly
  // reachable database port. Failing here exits the container, which is the
  // loud signal a broken release should give.
  await migrateDatabase(workerEnv.DATABASE_URL, () =>
    migrateJobQueue({
      connectionString: workerEnv.JOB_DATABASE_URL,
      poolSize: workerEnv.JOB_DB_POOL_SIZE,
    }),
  );
  console.log(
    JSON.stringify({ component: "job-worker", event: "migrations_applied" }),
  );

  const queue = new JobQueue(
    {
      connectionString: workerEnv.JOB_DATABASE_URL,
      poolSize: workerEnv.JOB_DB_POOL_SIZE,
    },
    { supervise: true },
  );

  try {
    await queue.registerWorkers(
      database.db,
      jobDefinitions.filter(
        (definition) => definition.role === workerEnv.WORKER_ROLE,
      ),
    );
  } catch (error) {
    await Promise.allSettled([
      queue.stop(workerEnv.WORKER_GRACEFUL_TIMEOUT_MS),
      database.close(),
    ]);
    throw error;
  }

  let maintenance: Promise<void> | undefined;
  const storageConfigured =
    workerEnv.R2_ENDPOINT &&
    workerEnv.R2_ACCESS_KEY_ID &&
    workerEnv.R2_SECRET_ACCESS_KEY &&
    workerEnv.R2_BUCKET_NAME;
  const storageConfig = storageConfigured
    ? {
        endpoint: workerEnv.R2_ENDPOINT!,
        accessKeyId: workerEnv.R2_ACCESS_KEY_ID!,
        secretAccessKey: workerEnv.R2_SECRET_ACCESS_KEY!,
        bucketName: workerEnv.R2_BUCKET_NAME!,
      }
    : null;
  const storeFile = storageConfig
    ? createFileStorage(database.db, storageConfig)
    : async () => {
        throw new Error(
          "Worker requires R2 configuration to save generated media.",
        );
      };
  const storageClient = storageConfig
    ? new S3Client({
        region: "auto",
        endpoint: storageConfig.endpoint,
        credentials: {
          accessKeyId: storageConfig.accessKeyId,
          secretAccessKey: storageConfig.secretAccessKey,
        },
      })
    : null;
  const deleteObject = async (key: string) => {
    try {
      if (!storageClient || !storageConfig)
        throw new Error("Storage unavailable");
      await storageClient.send(
        new DeleteObjectCommand({ Bucket: storageConfig.bucketName, Key: key }),
      );
      return { success: true };
    } catch {
      return { success: false, error: "Object deletion failed." };
    }
  };
  const uploads = storageConfig
    ? createUploadRepository(database.db, buildFileUrl, deleteObject)
    : null;
  const maintain = async () => {
    await finalizePendingAiRuns(database.db, storeFile);
    if (uploads) {
      await uploads.recoverStaleUploadCleanupClaims();
      await uploads.cleanupExpiredUploadIntents();
      await cleanupDeletedFiles(database.db, deleteObject);
    }
  };
  const maintenanceTimer = setInterval(() => {
    if (workerEnv.WORKER_ROLE === "render") return;
    if (maintenance) return;
    maintenance = maintain()
      .catch((error: unknown) => console.error("Maintenance failed:", error))
      .finally(() => {
        maintenance = undefined;
      });
  }, 5000);
  maintenanceTimer.unref();
  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(maintenanceTimer);
    console.log(
      JSON.stringify({ component: "job-worker", event: "shutdown", signal }),
    );

    const deadline = setTimeout(() => {
      console.error("Worker shutdown deadline exceeded.");
      process.exit(1);
    }, workerEnv.WORKER_GRACEFUL_TIMEOUT_MS + 1_000);
    deadline.unref();
    try {
      await queue.stop(workerEnv.WORKER_GRACEFUL_TIMEOUT_MS);
      await maintenance;
      await database.close();
      process.exitCode = 0;
    } catch (error) {
      console.error(
        JSON.stringify({
          component: "job-worker",
          event: "shutdown_failed",
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
  console.log(
    JSON.stringify({ component: "job-worker", event: "worker_ready" }),
  );
}

void main().catch((error) => {
  console.error(
    JSON.stringify({
      component: "job-worker",
      event: "worker_start_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
