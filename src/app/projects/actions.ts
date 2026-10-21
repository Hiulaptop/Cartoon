"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getDb } from "@/lib/db/client";
import { projects, videos } from "@/lib/db/schema";
import type { FormState } from "@/lib/form";
import { isInSubtree } from "@/lib/project/queries";

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

// Anh em cùng cha trùng tên (kể cả cùng ở gốc).
async function siblingClash(parentId: string | null, name: string, exceptId?: string): Promise<boolean> {
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(parentId ? eq(projects.parentId, parentId) : isNull(projects.parentId), eq(projects.name, name)));
  return rows.some((r) => r.id !== exceptId);
}

export async function createProject(_prev: FormState, form: FormData): Promise<FormState> {
  const name = text(form, "name");
  const parentId = text(form, "parentId") || null;
  if (name.length < 1) return { error: "Nhập tên project" };
  if (await siblingClash(parentId, name)) return { error: "Đã có project cùng tên ở thư mục này" };
  const [created] = await getDb().insert(projects).values({ name, parentId }).returning({ id: projects.id });
  revalidatePath("/projects");
  redirect(`/projects/${created.id}`);
}

export async function renameProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const name = text(form, "name");
  if (name.length < 1) return { error: "Nhập tên project" };
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p) return { error: "Không có project này" };
  if (await siblingClash(p.parentId, name, id)) return { error: "Đã có project cùng tên ở thư mục này" };
  await getDb().update(projects).set({ name }).where(eq(projects.id, id));
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return {};
}

// Di chuyển project vào cha mới (rỗng = đưa ra gốc). Từ chối nếu cha mới là chính nó hoặc hậu duệ của nó.
export async function moveProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const newParent = text(form, "newParentId") || null;
  const [p] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!p) return { error: "Không có project này" };
  if (newParent && (await isInSubtree(id, newParent))) return { error: "Không thể chuyển project vào chính nó hoặc thư mục con của nó" };
  if (await siblingClash(newParent, p.name, id)) return { error: "Thư mục đích đã có project cùng tên" };
  await getDb().update(projects).set({ parentId: newParent }).where(eq(projects.id, id));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return {};
}

// Chặn xóa khi còn project con hoặc design (spec §3.3 mục 4).
export async function deleteProject(_prev: FormState, form: FormData): Promise<FormState> {
  const id = text(form, "projectId");
  const db = getDb();
  const [child] = await db.select({ id: projects.id }).from(projects).where(eq(projects.parentId, id)).limit(1);
  if (child) return { error: "Thư mục còn project con, không xóa được" };
  const [design] = await db.select({ id: videos.id }).from(videos).where(eq(videos.projectId, id)).limit(1);
  if (design) return { error: "Thư mục còn bản thiết kế, không xóa được" };
  const [p] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/projects");
  redirect(p?.parentId ? `/projects/${p.parentId}` : "/projects");
}
