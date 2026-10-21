import Link from "next/link";

import { PlaygroundForm } from "@/components/scene/playground-form";

export default function PlaygroundPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <Link href="/scenes" className="text-sm text-muted-foreground hover:underline">
          ← Sinh cảnh
        </Link>
        <h1 className="text-2xl font-semibold">Sân thử JSON cảnh</h1>
        <p className="text-sm text-muted-foreground">Khuôn v1: 1920×1080, 30 fps, thời gian tính bằng frame.</p>
      </div>
      <PlaygroundForm />
    </div>
  );
}
