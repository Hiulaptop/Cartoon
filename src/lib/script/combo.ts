import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { combos } from "@/lib/db/schema";

import { comboDefinitionSchema, type ComboDefinition } from "./schema";

export const DEFAULT_COMBO_NAME = "default-v1";

// Combo cố định của lát cắt đầu (spec §7). Miếng hài theo "benign violation" (McGraw & Warren 2010):
// tình huống sai lệch nhưng vô hại. Sửa combo sau lát cắt đầu = spec combo/ACE.
export const DEFAULT_COMBO: ComboDefinition = {
  structure: [
    { role: "hook", minSeconds: 5, maxSeconds: 15, guidance: "Open on a striking question, problem or odd image that makes viewers want the answer." },
    { role: "setup", minSeconds: 10, maxSeconds: 40, guidance: "Establish the characters, the goal and one rule of the situation that will be bent later." },
    { role: "escalation", minSeconds: 15, maxSeconds: 60, guidance: "Each attempt makes things worse or weirder; plant the detail that pays off later." },
    { role: "punchline", minSeconds: 5, maxSeconds: 20, guidance: "Pay off the setup with a harmless violation of expectation." },
    { role: "resolution", minSeconds: 5, maxSeconds: 25, guidance: "Wrap up the situation in a clear final image." },
    { role: "tag", minSeconds: 3, maxSeconds: 10, guidance: "One last short joke or callback after the story ends." },
  ],
  hook: { maxSeconds: 15, guidance: "Within the first 5-15 seconds show the central conflict or question." },
  gagTechniques: [
    { kind: "callback", guidance: "Repeat an earlier detail in a new context." },
    { kind: "subversion", guidance: "Set up a familiar pattern, then break it." },
    { kind: "situational", guidance: "Ordinary people in a slightly absurd but harmless situation." },
    { kind: "wordplay", guidance: "Puns and double meanings that a teen audience gets instantly." },
  ],
  tone: "Witty, warm, a little absurd. Teen-friendly (TV-14 at most): no intense violence, sexual content, strong language or suggestive dialogue.",
  pacing: "Short punchy lines, a beat of action every few seconds, no scene longer than 25 seconds.",
  minGags: 2,
};

export async function ensureDefaultCombo(): Promise<{ id: string; definition: ComboDefinition }> {
  const db = getDb();
  const [existing] = await db.select().from(combos).where(eq(combos.name, DEFAULT_COMBO_NAME)).limit(1);
  if (existing) return { id: existing.id, definition: comboDefinitionSchema.parse(existing.definition) };
  const [created] = await db
    .insert(combos)
    .values({ name: DEFAULT_COMBO_NAME, definition: DEFAULT_COMBO })
    .onConflictDoNothing()
    .returning();
  if (created) return { id: created.id, definition: DEFAULT_COMBO };
  // Hai tiến trình tạo cùng lúc: đọc lại bản đã có.
  const [again] = await db.select().from(combos).where(eq(combos.name, DEFAULT_COMBO_NAME)).limit(1);
  return { id: again.id, definition: comboDefinitionSchema.parse(again.definition) };
}
