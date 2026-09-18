import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getReferenceState } from "@/lib/ugc/queries";

const referenceIdSchema = z.uuid();

/** Reading state for one reference, polled while the worker is working. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ referenceId: string }> },
) {
  const parsed = referenceIdSchema.safeParse((await params).referenceId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const state = await getReferenceState(parsed.data);
  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state, {
    headers: { "cache-control": "private, no-store" },
  });
}
