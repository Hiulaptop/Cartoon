import * as z from "zod";

import { ASSET_KINDS } from "@/lib/assets/naming";

const NAME = "[a-z0-9]+(?:_[a-z0-9]+)*";
const assetName = z.string().regex(new RegExp(`^(?:chr|bg|prop|fx)_${NAME}$`), "tên asset dạng chr_ten, bg_ten…");
const stateName = z.string().regex(new RegExp(`^${NAME}$`));

// Khuôn đề xuất asset v1 (spec ai-casting §4.1). Trần 20/40/30 chỉ là trần kỹ thuật, không phải giới hạn nghiệp vụ.
export const castingSchema = z.strictObject({
  version: z.literal(1),
  useAssets: z.array(assetName).max(30),
  newAssets: z
    .array(
      z.strictObject({
        key: z.string().regex(/^[a-z][a-z0-9_]{0,23}$/, "key: chữ thường, số, _"),
        kind: z.enum(ASSET_KINDS),
        displayName: z.string().min(1).max(60),
        brief: z.string().min(10).max(400),
        reason: z.string().min(5).max(300),
        states: z.array(stateName).max(8),
      }),
    )
    .max(20),
  newVariants: z
    .array(z.strictObject({ asset: assetName, state: stateName, reason: z.string().min(5).max(300) }))
    .max(40),
});

export type CastingV1 = z.output<typeof castingSchema>;
