import { NextResponse } from "next/server";

import { listChatModels } from "@/lib/ninerouter/models";

export const dynamic = "force-dynamic";

// Chỉ đọc. API key ở lại server; trình duyệt chỉ nhận danh sách model chat.
export async function GET() {
  try {
    const { models, fetchedAt } = await listChatModels();
    return NextResponse.json({ models, defaultModel: process.env.LLM_WRITER_MODEL ?? null, fetchedAt });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không tải được danh sách model" }, { status: 502 });
  }
}
