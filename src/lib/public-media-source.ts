import { compositions, mediaSources } from "@/lib/db/schema";

type MediaSourceRow = typeof mediaSources.$inferSelect;
type CompositionRow = typeof compositions.$inferSelect;

/** Keep local filesystem paths and other server-only fields out of browser/agent responses. */
export function publicMediaSource(source: MediaSourceRow) {
  return {
    id: source.id,
    projectId: source.projectId,
    originalName: source.originalName,
    mimeType: source.mimeType,
    sizeBytes: source.sizeBytes,
    duration: source.duration,
    width: source.width,
    height: source.height,
    hasAudio: source.hasAudio,
    status: source.status,
    progress: source.progress,
    model: source.model,
    device: source.device,
    language: source.language,
    transcript: source.transcript,
    error: source.error,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt,
  };
}

export function publicMediaComposition(
  composition: CompositionRow,
  urls: { outputUrl: string | null; downloadUrl: string | null },
) {
  return {
    id: composition.id,
    projectId: composition.projectId,
    resolution: composition.resolution,
    aspectRatio: composition.aspectRatio,
    duration: composition.duration,
    ttsEnabled: composition.ttsEnabled,
    subtitleStyle: composition.subtitleStyle,
    aigcBadge: composition.aigcBadge,
    label: composition.label,
    status: composition.status,
    createdAt: composition.createdAt,
    ...urls,
  };
}
