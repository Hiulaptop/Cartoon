import type { Issue, Research, Storyboard } from "./contracts";
import { wrapCaption } from "./timeline";

export type SourceEvidence = { id: string; hash: string; text: string };
const blocker = (code: string, path: string, message: string): Issue => ({ code, path, message, severity: "blocker" });
export function checkResearch(research: Research, sources: SourceEvidence[]): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  for (const claim of research.claims) {
    if (ids.has(claim.id)) issues.push(blocker("duplicate", claim.id, "ID khẳng định bị trùng"));
    ids.add(claim.id);
    if (claim.kind === "fact" && !claim.evidence.length) issues.push(blocker("evidence", claim.id, "Dữ kiện phải có bằng chứng đã đọc"));
    if (claim.kind === "inference" && !claim.dependsOnClaimIds.length) issues.push(blocker("premise", claim.id, "Suy luận cần chỉ rõ tiền đề"));
    for (const evidence of claim.evidence) {
      const source = sources.find((item) => item.id === evidence.sourceId);
      if (!source || source.hash !== evidence.sourceHash || evidence.start >= evidence.end || evidence.end > source.text.length || source.text.slice(evidence.start, evidence.end) !== evidence.quote) issues.push(blocker("quote", claim.id, "Trích đoạn/hash không khớp snapshot nguồn"));
    }
  }
  const claimsById = new Map(research.claims.map((claim) => [claim.id, claim]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cycle = claimsById.get(id)?.dependsOnClaimIds.some(visit) ?? false;
    visiting.delete(id);
    visited.add(id);
    return cycle;
  };
  for (const claim of research.claims) {
    if (claim.dependsOnClaimIds.some((id) => !ids.has(id) || id === claim.id)) issues.push(blocker("premise", claim.id, "Tiền đề không tồn tại hoặc tự tham chiếu"));
    if (visit(claim.id)) issues.push(blocker("cycle", claim.id, "Tiền đề suy luận có vòng lặp"));
  }
  if (!research.claims.some((claim) => claim.central)) issues.push(blocker("central", "research", "Cần ít nhất một khẳng định trung tâm"));
  const supportCache = new Map<string, boolean>();
  const supported = (id: string, path: Set<string>): boolean => {
    const claim = claimsById.get(id);
    if (!claim || path.has(id) || claim.kind === "assumption") return false;
    const cached = supportCache.get(id);
    if (cached !== undefined) return cached;
    const next = new Set(path).add(id);
    const result = claim.kind === "fact" ? claim.evidence.length > 0 : claim.dependsOnClaimIds.length > 0 && claim.dependsOnClaimIds.every((premise) => supported(premise, next));
    supportCache.set(id, result);
    return result;
  };
  for (const claim of research.claims.filter((item) => item.central)) {
    if (!supported(claim.id, new Set())) issues.push(blocker("central", claim.id, "Kết luận trung tâm phải là dữ kiện có bằng chứng hoặc suy luận hoàn toàn từ dữ kiện có bằng chứng, không chỉ từ giả định"));
  }
  for (const message of research.unresolved) issues.push(blocker("unresolved", "research", message));
  return issues;
}
export function checkStoryboard(storyboard: Storyboard, research: Research): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  const claims = new Map(research.claims.map((claim) => [claim.id, claim]));
  let cueCount = 0;
  for (const scene of storyboard.scenes) {
    for (const id of [scene.id, ...scene.objects.map((item) => item.id), ...scene.cues.map((item) => item.id)]) {
      if (ids.has(id)) issues.push(blocker("duplicate", id, "ID phải duy nhất trong video"));
      ids.add(id);
    }
    const targets = new Set(scene.objects.map((item) => item.id));
    if (new Set(scene.objects.map((item) => item.slot)).size !== scene.objects.length) issues.push(blocker("slot", scene.id, "Hai đối tượng dùng chung vị trí"));
    const queues = new Map<string, number>();
    for (const cue of scene.cues) {
      cueCount++;
      try { wrapCaption(cue.text); } catch (error) { issues.push(blocker("caption", cue.id, error instanceof Error ? error.message : "Phụ đề quá dài")); }
      if (!cue.claimIds.length || cue.claimIds.some((id) => !claims.has(id))) issues.push(blocker("claim", cue.id, "Câu cần liên kết khẳng định đã duyệt"));
      if (cue.claimIds.some((id) => claims.get(id)?.kind === "assumption") && !scene.assumptions.length) issues.push(blocker("assumption", scene.id, "Mô hình giả định cần nhãn hiển thị"));
      let previous = 0;
      for (const op of cue.operations) {
        if (op.from > op.to || op.from < previous) issues.push(blocker("timing", cue.id, "Thứ tự hoặc khoảng thao tác không hợp lệ"));
        previous = op.from;
        if (!targets.has(op.action.target) || (op.action.op === "flow.emit" && !targets.has(op.action.to))) issues.push(blocker("target", cue.id, "Đối tượng thao tác không tồn tại trong cảnh"));
        if (op.action.op === "counter.set") {
          const waiting = [...queues.values()].reduce((sum, count) => sum + count, 0);
          if (op.action.value !== waiting || op.action.unit !== "đang chờ") issues.push(blocker("counter", cue.id, "MVP chỉ hỗ trợ counter tổng số phần tử đang chờ, tính từ queue hiện tại, unit = đang chờ; không nhận số liệu LLM tự tính"));
        }
        if (op.action.op === "queue.enqueue" || op.action.op === "queue.serve") {
          const n = (queues.get(op.action.target) ?? 0) + (op.action.op === "queue.enqueue" ? 1 : -1);
          queues.set(op.action.target, n);
          if (n < 0 || n > 12) issues.push(blocker("queue", cue.id, "Hàng đợi rỗng hoặc vượt 12 phần tử"));
        }
      }
    }
  }
  if (cueCount > 120) issues.push(blocker("limit", "cues", "Tối đa 120 cue"));
  if (!storyboard.scenes.some((scene) => scene.id === storyboard.previewSceneId)) issues.push(blocker("preview", "previewSceneId", "Cảnh preview không tồn tại"));
  return issues;
}
