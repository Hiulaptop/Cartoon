"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { assets, series, videos } from "@/lib/db/schema";
import type { FormState } from "@/lib/form";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

export async function createSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  if (name.length < 2) return { error: "Tên phim ít nhất 2 ký tự" };
  const [clash] = await getDb().select({ id: series.id }).from(series).where(eq(series.name, name)).limit(1);
  if (clash) return { error: "Đã có bộ phim tên này" };
  const [created] = await getDb().insert(series).values({ name }).returning({ id: series.id });
  revalidatePath("/series");
  redirect(`/series/${created.id}`);
}

export async function renameSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "seriesId");
  const name = text(form, "name");
  if (name.length < 2) return { error: "Tên phim ít nhất 2 ký tự" };
  const [clash] = await getDb().select({ id: series.id }).from(series).where(eq(series.name, name)).limit(1);
  if (clash && clash.id !== id) return { error: "Đã có bộ phim tên này" };
  await getDb().update(series).set({ name }).where(eq(series.id, id));
  revalidatePath(`/series/${id}`);
  revalidatePath("/series");
  return {};
}

// Chặn xóa khi còn asset hoặc design (RESTRICT ở DB; báo lỗi rõ ở đây).
export async function deleteSeries(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "seriesId");
  const db = getDb();
  const [a] = await db.select({ id: assets.id }).from(assets).where(eq(assets.seriesId, id)).limit(1);
  if (a) return { error: "Bộ phim còn asset, không xóa được" };
  const [v] = await db.select({ id: videos.id }).from(videos).where(eq(videos.seriesId, id)).limit(1);
  if (v) return { error: "Bộ phim còn bản thiết kế, không xóa được" };
  await db.delete(series).where(eq(series.id, id));
  revalidatePath("/series");
  redirect("/series");
}
