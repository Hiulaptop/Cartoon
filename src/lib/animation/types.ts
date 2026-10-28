import type * as z from "zod";
import type { draftSchema, layoutSchema, itemSchema } from "./schema";

export const SHOWCASE = { width: 1920, height: 1080, fps: 30, frames: 600, presetVersion: 1 } as const;
export type Point = { x: number; y: number };
export type Layout = z.output<typeof layoutSchema>;
export type Draft = z.output<typeof draftSchema>;
export type LayerItem = z.output<typeof itemSchema>;
export type Intensity = "subtle" | "normal" | "strong";
export type MotionKind = "idle_bob" | "walk_bob" | "run_bob" | "hop" | "recoil" | "squash";
export type Pose = { offsetX: number; offsetY: number; rotateDeg: number; scaleX: number; scaleY: number; opacity: number };
export type ImageAsset = { path: string; width: number; height: number; hash: string };
export type ShowcaseProps = { draft: Draft; assets: Record<string, ImageAsset>; states: string[]; warnings: string[]; assetMode: "url" | "static" };
export type AssetOption = { ref: string; label: string; kind: string; width: number; height: number };
