import { NextResponse } from "next/server";

import { getDesignActivity } from "@/lib/algorithm/activity";
import { errorMessage } from "@/lib/errors";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  try {
    return NextResponse.json(await getDesignActivity(id), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}
