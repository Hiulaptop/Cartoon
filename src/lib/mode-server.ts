import { cookies } from "next/headers";
import { cache } from "react";

import { MODE_COOKIE, parseMode, type Mode } from "@/lib/mode";

// Đọc chế độ từ cookie, mỗi request một lần. Chỉ dùng để quyết định cái gì được hiện;
// server action và worker không bao giờ dựa vào giá trị này (spec S2).
export const getMode = cache(async (): Promise<Mode> => parseMode((await cookies()).get(MODE_COOKIE)?.value));
