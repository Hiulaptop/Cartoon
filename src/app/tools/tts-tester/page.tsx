import { TTSTester } from "@/components/tools/tts-tester";

export const metadata = {
  title: "Thử giọng đọc TTS · Cartoon",
  description: "Trải nghiệm và chọn giọng đọc Tiếng Việt VieNeu-TTS v3 Turbo chạy trên máy local",
};

export default function TTSTesterPage() {
  return (
    <div className="mx-auto max-w-5xl py-6">
      <TTSTester />
    </div>
  );
}
