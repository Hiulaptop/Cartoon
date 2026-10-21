import { sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { projects, videos } from "@/lib/db/schema";

import { buildTree, type ProjectNode } from "./tree";

export async function loadTree(): Promise<ProjectNode[]> {
  const db = getDb();
  const [ps, ds] = await Promise.all([db.select().from(projects), db.select().from(videos)]);
  return buildTree(
    ps,
    ds.map((d) => ({ id: d.id, title: d.title, status: d.status, projectId: d.projectId, seriesId: d.seriesId })),
  );
}

// Đường dẫn từ project gốc tới project này (breadcrumb), theo thứ tự gốc -> chính nó.
export async function ancestors(projectId: string): Promise<{ id: string; name: string }[]> {
  const res = await getDb().execute<{ id: string; name: string }>(sql`
    WITH RECURSIVE up AS (
      SELECT id, name, parent_id, 0 AS depth FROM projects WHERE id = ${projectId}::uuid
      UNION ALL
      SELECT p.id, p.name, p.parent_id, u.depth + 1 FROM projects p JOIN up u ON p.id = u.parent_id
    )
    SELECT id, name FROM up ORDER BY depth DESC`);
  return res.rows;
}

// candidateId có nằm trong cây con gốc rootId (kể cả chính nó) không. Dùng để chống vòng lặp khi di chuyển.
export async function isInSubtree(rootId: string, candidateId: string): Promise<boolean> {
  const res = await getDb().execute<{ found: number }>(sql`
    WITH RECURSIVE sub AS (
      SELECT id FROM projects WHERE id = ${rootId}::uuid
      UNION ALL
      SELECT p.id FROM projects p JOIN sub s ON p.parent_id = s.id
    )
    SELECT 1 AS found FROM sub WHERE id = ${candidateId}::uuid LIMIT 1`);
  return res.rows.length > 0;
}
