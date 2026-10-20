import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

type Check = { name: string; path: string; ok: boolean };

async function probe(name: string, path: string): Promise<Check> {
  try {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { apikey: SUPABASE_ANON_KEY },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return { name, path, ok: res.ok };
  } catch {
    return { name, path, ok: false };
  }
}

export default async function Home() {
  const checks = await Promise.all([
    probe("Supabase Auth", "/auth/v1/health"),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Cartoon</CardTitle>
          <CardDescription>
            Next.js 15 · shadcn/ui · Tailwind CSS · Supabase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2 text-sm">
            {checks.map((c) => (
              <li key={c.name} className="flex items-center justify-between">
                <span>
                  {c.name}{" "}
                  <code className="font-mono text-xs text-muted-foreground">
                    {c.path}
                  </code>
                </span>
                <span className={c.ok ? "text-green-600" : "text-destructive"}>
                  {c.ok ? "Hoạt động" : "Không phản hồi"}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </main>
  );
}
