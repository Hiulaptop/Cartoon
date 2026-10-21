"use client";

import { useActionState } from "react";

import { createProject, deleteProject, moveProject, renameProject } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FormState } from "@/lib/form";

const fieldClass = "rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm";

export function CreateProjectForm({ parentId }: { parentId: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createProject, {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <input type="hidden" name="parentId" value={parentId ?? ""} />
      <Input name="name" required placeholder={parentId ? "Tên project con" : "Tên project"} className="max-w-xs" />
      <Button type="submit" disabled={pending}>
        Tạo project
      </Button>
      {state.error && <p className="w-full text-sm text-destructive">{state.error}</p>}
    </form>
  );
}

export function ProjectSettings({
  project,
  others,
}: {
  project: { id: string; name: string; parentId: string | null };
  others: { id: string; label: string }[];
}) {
  const [renameState, rename, renaming] = useActionState<FormState, FormData>(renameProject, {});
  const [moveState, move, moving] = useActionState<FormState, FormData>(moveProject, {});
  const [deleteState, remove, deleting] = useActionState<FormState, FormData>(deleteProject, {});

  return (
    <div className="flex flex-col gap-3">
      <form action={rename} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="projectId" value={project.id} />
        <Input name="name" defaultValue={project.name} required className="max-w-xs" />
        <Button type="submit" size="sm" variant="outline" disabled={renaming}>
          Đổi tên
        </Button>
        {renameState.error && <p className="w-full text-xs text-destructive">{renameState.error}</p>}
      </form>
      <form action={move} className="flex flex-wrap items-start gap-2">
        <input type="hidden" name="projectId" value={project.id} />
        <select name="newParentId" defaultValue={project.parentId ?? ""} className={fieldClass}>
          <option value="">(Gốc)</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={moving}>
          Di chuyển
        </Button>
        {moveState.error && <p className="w-full text-xs text-destructive">{moveState.error}</p>}
      </form>
      <form action={remove}>
        <input type="hidden" name="projectId" value={project.id} />
        <Button type="submit" size="sm" variant="outline" disabled={deleting}>
          Xóa project
        </Button>
        {deleteState.error && <p className="mt-1 text-xs text-destructive">{deleteState.error}</p>}
      </form>
    </div>
  );
}
