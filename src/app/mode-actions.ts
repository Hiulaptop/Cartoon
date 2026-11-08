"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { isMode, MODE_COOKIE } from "@/lib/mode";

// Chỉ cho chuyển về các đường dẫn này để không thành open redirect.
const REDIRECT_ALLOWLIST: readonly string[] = ["/"];
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Ghi chế độ hiển thị. Đầu vào đến từ client nên kiểm bằng allowlist. Ghi cookie trong Server Action làm
// server render lại trang hiện tại; revalidatePath ở layout gốc là dự phòng. redirect() ném ngoại lệ điều khiển
// nên phải đặt cuối cùng.
export async function setMode(mode: string, redirectTo?: string): Promise<{ error?: string }> {
  if (!isMode(mode)) return { error: "Chế độ không hợp lệ." };
  if (redirectTo !== undefined && !REDIRECT_ALLOWLIST.includes(redirectTo)) return { error: "Đích chuyển trang không hợp lệ." };

  (await cookies()).set(MODE_COOKIE, mode, { path: "/", sameSite: "lax", httpOnly: true, maxAge: ONE_YEAR_SECONDS });
  revalidatePath("/", "layout");
  if (redirectTo !== undefined) redirect(redirectTo);
  return {};
}
