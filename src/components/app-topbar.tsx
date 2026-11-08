"use client";

import { MenuIcon, MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useState } from "react";

import { SidebarNav } from "@/components/app-sidebar";
import { ModeSwitch } from "@/components/mode-switch";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { Mode } from "@/lib/mode";

export function AppTopbar({ mode }: { mode: Mode }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="mb-4 flex items-center justify-between gap-1">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mở menu" className="md:hidden">
            <MenuIcon />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-4 text-sidebar-foreground">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
            <SheetDescription>Điều hướng giữa các khu vực của ứng dụng</SheetDescription>
          </SheetHeader>
          <SidebarNav mode={mode} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>
      <ModeSwitch mode={mode} />
      <div className="ml-auto flex gap-1">
        <NotificationBell />
        <Button variant="ghost" size="icon" aria-label="Đổi giao diện sáng hoặc tối" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <SunIcon className="hidden dark:block" />
          <MoonIcon className="dark:hidden" />
        </Button>
      </div>
    </div>
  );
}
