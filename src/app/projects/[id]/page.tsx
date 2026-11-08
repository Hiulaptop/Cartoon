import Link from "next/link";
import { notFound } from "next/navigation";

import { CreateProjectForm, ProjectSettings } from "@/components/projects/project-forms";
import { TreeList } from "@/components/projects/tree-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ancestors, loadTree } from "@/lib/project/queries";
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
import { filterTreeByKind, findProject, type ProjectNode } from "@/lib/project/tree";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Mọi project trừ nhánh `exclude` (chính nó và hậu duệ), nhãn là đường dẫn đầy đủ: đích hợp lệ khi di chuyển.
function moveTargets(nodes: readonly ProjectNode[], exclude: string, prefix = ""): { id: string; label: string }[] {
  return nodes.flatMap((n) => {
    if (n.id === exclude) return [];
    const label = prefix ? `${prefix} › ${n.name}` : n.name;
    return [{ id: n.id, label }, ...moveTargets(n.projects, exclude, label)];
  });
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const roots = await loadTree();
  const node = findProject(roots, id);
  if (!node) notFound();
  const mode = await getMode();
  const view = findProject(filterTreeByKind(roots, mode), id);
  if (!view) notFound();
  const hidden = node.summary().designs - view.summary().designs;
  const trail = await ancestors(id);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link href="/projects" className="hover:underline">
            Project
          </Link>
          {trail.slice(0, -1).map((p) => (
            <span key={p.id}>
              {" › "}
              <Link href={`/projects/${p.id}`} className="hover:underline">
                {p.name}
              </Link>
            </span>
          ))}
        </p>
        <h1 className="text-2xl font-semibold">📁 {node.name}</h1>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <Link
          href={`/projects/${id}/new-design`}
          className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Tạo bản thiết kế
        </Link>
        <CreateProjectForm parentId={id} />
      </div>

      {node.projects.length === 0 && node.designs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Thư mục trống.</p>
      ) : (
        <TreeList nodes={[view]} />
      )}
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          Đang ẩn {hidden} design của chế độ {MODE_LABELS[mode === "cartoon" ? "algorithm" : "cartoon"]} trong thư mục này. Đổi chế độ ở đầu trang để xem.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Cài đặt project</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectSettings project={{ id: node.id, name: node.name, parentId: node.parentId }} others={moveTargets(roots, id)} />
        </CardContent>
      </Card>
    </div>
  );
}
