import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProductState } from "@/lib/ugc/queries";

const productIdSchema = z.uuid();

/** Reading state for one product, polled while the reader is working. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const parsed = productIdSchema.safeParse((await params).productId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const state = await getProductState(parsed.data);
  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state, {
    headers: { "cache-control": "private, no-store" },
  });
}
