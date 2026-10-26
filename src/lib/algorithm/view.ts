import type { AlgorithmData } from "@/lib/algorithm/workflow-cache";

export function problemText(revision: AlgorithmData["revisions"][number] | undefined): string {
  const parsed = revision?.content as { text?: unknown } | undefined;
  return typeof parsed?.text === "string" ? parsed.text : "";
}

export function problemStory(revision: AlgorithmData["revisions"][number] | undefined): { theme?: string; topic?: string; story?: string; modeling?: string } {
  const content = revision?.content as { version?: unknown; theme?: unknown; topic?: unknown; story?: unknown; modeling?: unknown } | undefined;
  if (content?.version !== 2) return {};
  const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);
  return { theme: str(content.theme), topic: str(content.topic), story: str(content.story), modeling: str(content.modeling) };
}
