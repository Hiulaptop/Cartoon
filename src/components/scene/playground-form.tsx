"use client";

import { useActionState } from "react";

import { playground, type PlaygroundState } from "@/app/scenes/actions";
import { ScenePlayer } from "@/components/scene/scene-player";
import { Button } from "@/components/ui/button";

export function PlaygroundForm() {
  const [state, action, pending] = useActionState<PlaygroundState, FormData>(playground, { json: "", issues: [] });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <form action={action} className="flex flex-col gap-3">
        <textarea
          key={state.json}
          name="json"
          defaultValue={state.json}
          rows={28}
          spellCheck={false}
          className="rounded-lg border border-input bg-transparent p-3 font-mono text-xs"
          placeholder="Dán JSON cảnh v1 hoặc bấm “Dùng mẫu”"
        />
        <div className="flex gap-2">
          <Button type="submit" name="intent" value="preview" disabled={pending}>
            Kiểm tra và xem trước
          </Button>
          <Button type="submit" name="intent" value="sample" variant="outline" disabled={pending}>
            Dùng mẫu
          </Button>
        </div>
        {state.issues.length > 0 && (
          <ul className="list-disc space-y-1 pl-5 text-sm text-destructive">
            {state.issues.map((issue) => (
              <li key={issue} className="break-words">
                {issue}
              </li>
            ))}
          </ul>
        )}
      </form>
      <div>
        {state.preview ? (
          <ScenePlayer dsl={state.preview.dsl} assets={state.preview.assets} />
        ) : (
          <p className="text-sm text-muted-foreground">Bản xem trước hiện ở đây khi JSON qua được bước kiểm tra.</p>
        )}
      </div>
    </div>
  );
}
