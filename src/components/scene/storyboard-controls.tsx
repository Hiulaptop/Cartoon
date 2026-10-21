"use client";

import { useActionState } from "react";

import type { FormState } from "@/app/assets/actions";
import { approveAllScenes, startStoryboard } from "@/app/scenes/storyboard-actions";
import { Button } from "@/components/ui/button";

export function StoryboardControls({ videoId, hasScenes, canApproveAll }: { videoId: string; hasScenes: boolean; canApproveAll: boolean }) {
  const [startState, start, starting] = useActionState<FormState, FormData>(startStoryboard, {});
  const [allState, all, approvingAll] = useActionState<FormState, FormData>(approveAllScenes, {});

  return (
    <div className="flex flex-wrap items-start gap-3">
      <form action={start}>
        <input type="hidden" name="videoId" value={videoId} />
        <Button type="submit" variant={hasScenes ? "outline" : "default"} disabled={starting}>
          {hasScenes ? "Sinh lại toàn bộ phân cảnh" : "Sinh phân cảnh"}
        </Button>
        {startState.error && <p className="mt-1 text-xs text-destructive">{startState.error}</p>}
      </form>
      {canApproveAll && (
        <form action={all}>
          <input type="hidden" name="videoId" value={videoId} />
          <Button type="submit" disabled={approvingAll}>
            Duyệt tất cả cảnh chờ duyệt
          </Button>
          {allState.error && <p className="mt-1 text-xs text-destructive">{allState.error}</p>}
        </form>
      )}
    </div>
  );
}
