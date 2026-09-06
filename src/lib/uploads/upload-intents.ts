import { db } from "@/database";
import { buildFileUrl } from "./url";
import { deleteFile } from "@/lib/r2";
import { createUploadRepository } from "./repository";
export {
  UploadQuotaExceededError,
  UploadIntentUnavailableError,
  UploadMetadataMismatchError,
} from "./repository";
export const {
  createUploadIntent,
  releaseUploadIntent,
  cancelUploadIntent,
  completeUploadIntent,
  cleanupExpiredUploadIntents,
  recoverStaleUploadCleanupClaims,
} = createUploadRepository(db, buildFileUrl, deleteFile);
