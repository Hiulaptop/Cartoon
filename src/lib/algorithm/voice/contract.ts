import { z } from "zod";

import { VOICE_MAX_SPOKEN_CHARS, VOICE_SPEED_MAX, VOICE_SPEED_MIN } from "./constants";

const speed = z.number().min(VOICE_SPEED_MIN).max(VOICE_SPEED_MAX);

export const AlgorithmVoiceV1Schema = z.strictObject({
  version: z.literal(1),
  voice: z.string().min(1).max(60),
  defaultSpeed: speed,
  scenes: z.array(z.strictObject({ sceneId: z.string().min(1).max(60), speed })).max(30),
  cues: z.array(z.strictObject({
    id: z.string().min(1).max(80),
    sceneId: z.string().min(1).max(60),
    dialogueIndex: z.number().int().min(0).max(29),
    spokenText: z.string().min(1).max(VOICE_MAX_SPOKEN_CHARS),
  })).min(1).max(300),
});
export type AlgorithmVoiceV1 = z.infer<typeof AlgorithmVoiceV1Schema>;

export const cueId = (sceneId: string, dialogueIndex: number) => `${sceneId}:${dialogueIndex}`;

export function sceneSpeed(voice: AlgorithmVoiceV1, sceneId: string): number {
  return voice.scenes.find((scene) => scene.sceneId === sceneId)?.speed ?? voice.defaultSpeed;
}
