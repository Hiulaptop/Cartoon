import { CreateProjectForm } from "@/components/projects/project-forms";
import { TreeList } from "@/components/projects/tree-list";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { errorMessage } from "@/lib/errors";
import { MODE_LABELS } from "@/lib/mode";
import { getMode } from "@/lib/mode-server";
import { loadTree } from "@/lib/project/queries";
import { countDesigns, filterTreeByKind, type ProjectNode } from "@/lib/project/tree";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const mode = await getMode();
  let roots: ProjectNode[] = [];
  let loadError: string | null = null;
  try {
    roots = await loadTree();
  } catch (error) {
    loadError = errorMessage(error);
  }
  const view = filterTreeByKind(roots, mode);
  const hidden = countDesigns(roots) - countDesigns(view);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">Project</h1>
      <Card>
        <CardHeader>
          <CardTitle>Project mới</CardTitle>
          <CardDescription>Project là thư mục: chứa project con và các bản thiết kế (mỗi bản là một tập phim).</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateProjectForm parentId={null} />
        </CardContent>
      </Card>
      {loadError && <p className="text-sm break-all text-destructive">Không đọc được dữ liệu: {loadError}</p>}
      {roots.length === 0 && !loadError ? <p className="text-sm text-muted-foreground">Chưa có project nào.</p> : <TreeList nodes={view} />}
      {hidden > 0 && (
        <p className="text-sm text-muted-foreground">
          Đang ẩn {hidden} design của chế độ {MODE_LABELS[mode === "cartoon" ? "algorithm" : "cartoon"]}. Đổi chế độ ở đầu trang để xem.
        </p>
      )}
    </div>
  );
}
