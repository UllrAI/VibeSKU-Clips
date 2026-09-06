import "server-only";
import { db } from "@/database";
import { getUploadConfig } from "@/lib/config/integrations";
import { createFileStorage } from "./store";

let storage: ReturnType<typeof createFileStorage> | undefined;

export const storeFile = (
  input: Parameters<ReturnType<typeof createFileStorage>>[0],
) => {
  storage ??= createFileStorage(db, getUploadConfig());
  return storage(input);
};
