import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { manifestToCsv } from "@/lib/ugc/manifest";
import { getExport } from "@/lib/ugc/queries";

const exportIdSchema = z.uuid();

/**
 * Serves the delivery manifest that ships with an export: one row per asset,
 * with the reference, product, language, market, talent and disclosure line.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ exportId: string }> },
) {
  const parsed = exportIdSchema.safeParse((await params).exportId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const record = await getExport(parsed.data);
  if (!record) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(manifestToCsv(record.manifest), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${record.id}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
