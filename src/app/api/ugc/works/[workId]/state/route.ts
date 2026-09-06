import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getWorkState } from "@/lib/ugc/works";

const workIdSchema = z.uuid();

/** Step state for one work, polled by the console while a step is working. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workId: string }> },
) {
  const parsed = workIdSchema.safeParse((await params).workId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const state = await getWorkState(parsed.data);
  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state, {
    headers: { "cache-control": "private, no-store" },
  });
}
