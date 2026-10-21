"use client";

import { useActionState, useState } from "react";

import type { FormState } from "@/lib/form";
import { startUpload, suggest } from "@/app/upload/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CATEGORIES } from "@/lib/youtube/metadata";

const fieldClass = "w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export type Suggestion = { title: string; description: string; tags: string[]; categoryId: string };

export function SuggestButton({ videoId }: { videoId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(suggest, {});
  return (
    <form action={action}>
      <input type="hidden" name="videoId" value={videoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        Gợi ý bằng LLM
      </Button>
      {state.error && <p className="mt-1 text-xs text-destructive">{state.error}</p>}
    </form>
  );
}

export function UploadForm({ videoId, suggestion }: { videoId: string; suggestion?: Suggestion }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startUpload, {});
  const [privacy, setPrivacy] = useState("private");

  return (
    // key theo gợi ý để form nạp lại giá trị mặc định khi có gợi ý mới.
    <form action={action} key={suggestion?.title ?? "empty"} className="flex flex-col gap-3">
      <input type="hidden" name="videoId" value={videoId} />
      <label className="flex flex-col gap-1 text-sm">
        Tiêu đề (tối đa 100 ký tự)
        <Input name="title" required maxLength={100} defaultValue={suggestion?.title ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Mô tả (tối đa 5000 byte)
        <textarea name="description" rows={5} className={fieldClass} defaultValue={suggestion?.description ?? ""} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Tag (cách nhau bằng dấu phẩy, tổng tối đa 500 ký tự)
        <Input name="tags" defaultValue={suggestion?.tags.join(", ") ?? ""} />
      </label>
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Danh mục
          <select name="categoryId" defaultValue={suggestion?.categoryId ?? "1"} className={fieldClass}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Quyền riêng tư
          <select name="privacy" value={privacy} onChange={(e) => setPrivacy(e.target.value)} className={fieldClass}>
            <option value="private">Riêng tư (mặc định)</option>
            <option value="unlisted">Không công khai (có link)</option>
            <option value="public">Công khai</option>
          </select>
        </label>
      </div>
      {privacy !== "private" && (
        <label className="flex items-center gap-2 text-sm text-destructive">
          <input type="checkbox" name="confirmPublic" />
          Tôi xác nhận video sẽ hiển thị ngoài chế độ riêng tư
        </label>
      )}
      <p className="text-xs text-muted-foreground">Dành cho trẻ em: Không (cố định). Nội dung hoạt hình phi thực tế: không cần khai báo nội dung AI.</p>
      {state.error && <p className="text-sm break-words text-destructive">{state.error}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Đang gửi..." : "Upload lên YouTube"}
      </Button>
    </form>
  );
}
