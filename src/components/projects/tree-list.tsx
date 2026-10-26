import Link from "next/link";

import { ALGORITHM_STAGE_LABELS, VIDEO_KIND_LABELS } from "@/lib/video/kind";
import type { ProjectNode } from "@/lib/project/tree";

const DESIGN_STATUS: Record<string, string> = {
  casting: "Casting",
  scripting: "Kịch bản",
  storyboarding: "Phân cảnh",
  rendering: "Render",
  uploading: "Upload",
  done: "Xong",
};

// Hiển thị cây project (đệ quy) cùng các design ở từng thư mục.
export function TreeList({ nodes }: { nodes: readonly ProjectNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 border-l pl-4">
      {nodes.map((node) => (
        <li key={node.id} className="flex flex-col gap-1">
          <Link href={`/projects/${node.id}`} className="text-sm font-medium hover:underline">
            📁 {node.name}
            <span className="ml-2 font-normal text-muted-foreground">{node.summary().designs} design</span>
          </Link>
          <TreeList nodes={node.projects} />
          {node.designs.length > 0 && (
            <ul className="flex flex-col gap-1 border-l pl-4">
              {node.designs.map((d) => (
                <li key={d.id}>
                  <Link href={`/designs/${d.id}`} className="text-sm hover:underline">
                    🎬 {d.name}
                    <span className="ml-2 text-muted-foreground">{VIDEO_KIND_LABELS[d.videoKind]} · {d.videoKind === "algorithm" ? ALGORITHM_STAGE_LABELS[d.status.slice("algorithm:".length)] ?? d.status : DESIGN_STATUS[d.status] ?? d.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}
