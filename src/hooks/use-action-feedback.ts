"use client";

import { useRouter } from "next/navigation";
import { useActionState, useCallback } from "react";
import { toast } from "sonner";

import type { FormState } from "@/lib/form";

type Action = (prev: FormState, form: FormData) => Promise<FormState>;
type Options = { success: string; description?: string; refresh?: boolean };

// Bọc server action sẵn có: bắn toast ngay khi có kết quả (kể cả khi component bị gỡ sau đó) và làm mới dữ liệu
// máy chủ, vì hầu hết action không gọi revalidatePath. Không dùng cho action kết thúc bằng redirect().
export function useActionFeedback(action: Action, { success, description, refresh = true }: Options) {
  const router = useRouter();
  const wrapped = useCallback<Action>(
    async (prev, form) => {
      const result = await action(prev, form);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(success, description ? { description } : undefined);
        if (refresh) router.refresh();
      }
      return result;
    },
    [action, success, description, refresh, router],
  );
  return useActionState<FormState, FormData>(wrapped, {});
}
