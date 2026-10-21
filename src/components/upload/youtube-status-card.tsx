import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { youtubeStatus } from "@/lib/youtube/status";

// Trạng thái OAuth YouTube: chỉ có/thiếu và tuổi token, không bao giờ hiện giá trị bí mật.
export function YoutubeStatusCard() {
  const yt = youtubeStatus();
  const age = yt.tokenAgeDays;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kết nối YouTube</CardTitle>
        <CardDescription>Chỉ hiện có/thiếu cấu hình, không hiện giá trị bí mật.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1 text-sm">
        {yt.configured ? (
          <p>Đã cấu hình OAuth.</p>
        ) : (
          <p className="text-destructive">
            Thiếu: {yt.missing.join(", ")}. Xem README (mục Upload YouTube), rồi chạy <code>npm run youtube:auth</code>.
          </p>
        )}
        {yt.configured && age !== null && (
          <p className={age >= 7 ? "text-destructive" : age >= 6 ? "text-amber-600" : "text-muted-foreground"}>
            Token cấp cách đây {age.toFixed(1)} ngày. Project ở chế độ Testing: token hết hạn sau 7 ngày, chạy lại{" "}
            <code>npm run youtube:auth</code>.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
