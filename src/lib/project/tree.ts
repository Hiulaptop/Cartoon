import type { VideoKind } from "@/lib/video/kind";

// Composite: node nhánh (project) chứa node nhánh/lá; node lá (design). Dựng trong bộ nhớ từ hai bảng.
export type NodeSummary = { designs: number; byStatus: Record<string, number> };

export interface TreeNode {
  readonly id: string;
  readonly name: string;
  readonly kind: "project" | "design";
  readonly children: readonly TreeNode[];
  summary(): NodeSummary;
}

export class DesignNode implements TreeNode {
  readonly kind = "design" as const;
  readonly children: readonly TreeNode[] = [];
  constructor(
    readonly id: string,
    readonly name: string,
    readonly status: string,
    readonly seriesId: string,
    readonly videoKind: VideoKind,
  ) {}
  summary(): NodeSummary {
    return { designs: 1, byStatus: { [this.status]: 1 } };
  }
}

export class ProjectNode implements TreeNode {
  readonly kind = "project" as const;
  readonly projects: ProjectNode[] = [];
  readonly designs: DesignNode[] = [];
  constructor(
    readonly id: string,
    readonly name: string,
    readonly parentId: string | null,
  ) {}
  get children(): readonly TreeNode[] {
    return [...this.projects, ...this.designs];
  }
  // Gộp số lượng của cả nhánh (con trực tiếp và mọi hậu duệ).
  summary(): NodeSummary {
    const total: NodeSummary = { designs: 0, byStatus: {} };
    for (const child of this.children) {
      const s = child.summary();
      total.designs += s.designs;
      for (const [status, n] of Object.entries(s.byStatus)) total.byStatus[status] = (total.byStatus[status] ?? 0) + n;
    }
    return total;
  }
}

type ProjectRow = { id: string; name: string; parentId: string | null };
type DesignRow = { id: string; title: string; status: string | null; projectId: string; seriesId: string; kind: VideoKind; algorithmStage: string | null };

// Trả về các project gốc, đã gắn con và design. Project mồ côi (cha không có) bị bỏ qua.
export function buildTree(projects: ProjectRow[], designs: DesignRow[]): ProjectNode[] {
  const nodes = new Map(projects.map((p) => [p.id, new ProjectNode(p.id, p.name, p.parentId)]));
  const roots: ProjectNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : null;
    if (parent) parent.projects.push(node);
    else if (!node.parentId) roots.push(node);
  }
  for (const d of designs) {
    const status = d.kind === "algorithm" ? `algorithm:${d.algorithmStage ?? "problem"}` : d.status ?? "unknown";
    nodes.get(d.projectId)?.designs.push(new DesignNode(d.id, d.title, status, d.seriesId, d.kind));
  }
  const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
  for (const node of nodes.values()) {
    node.projects.sort(byName);
    node.designs.sort(byName);
  }
  return roots.sort(byName);
}

export function findProject(roots: ProjectNode[], id: string): ProjectNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const inChild = findProject(root.projects, id);
    if (inChild) return inChild;
  }
  return null;
}

// Bản sao cây chỉ giữ design thuộc `kind`; thư mục giữ nguyên. CHỈ dùng để hiển thị:
// kiểm tra "trống" hay chặn xoá phải dùng cây gốc chưa lọc (spec S5).
export function filterTreeByKind(roots: readonly ProjectNode[], kind: VideoKind): ProjectNode[] {
  return roots.map((root) => {
    const copy = new ProjectNode(root.id, root.name, root.parentId);
    copy.projects.push(...filterTreeByKind(root.projects, kind));
    copy.designs.push(...root.designs.filter((design) => design.videoKind === kind));
    return copy;
  });
}

export const countDesigns = (nodes: readonly ProjectNode[]): number => nodes.reduce((total, node) => total + node.summary().designs, 0);
