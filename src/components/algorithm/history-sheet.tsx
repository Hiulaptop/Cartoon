"use client";

import { HistoryIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function HistorySheet({ children }: { children: React.ReactNode }) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <HistoryIcon data-icon="inline-start" /> Lịch sử
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Lịch sử revision và quyết định</SheetTitle>
          <SheetDescription>Mọi bản đã tạo, nguồn đầu vào và lý do duyệt hoặc từ chối.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
