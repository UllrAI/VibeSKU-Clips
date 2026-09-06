import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getBatchProgress } from "@/lib/ugc/queries";

const batchIdSchema = z.uuid();

/**
 * Counts for one batch, polled by the batch console while work is in flight.
 * Deliberately small: the console re-fetches the rows themselves only when
 * these numbers change, so an idle tab costs one cheap query per interval.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const parsed = batchIdSchema.safeParse((await params).batchId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const progress = await getBatchProgress(parsed.data);
  if (!progress) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(progress, {
    headers: { "cache-control": "private, no-store" },
  });
}
