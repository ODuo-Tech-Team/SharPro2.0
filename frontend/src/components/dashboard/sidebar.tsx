"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Settings,
  Fish,
  MessageSquare,
  Megaphone,
  MessageCircle,
  Smartphone,
} from "lucide-react";

const navigation = [
  {
    name: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    name: "Conversas",
    href: "/dashboard/conversations",
    icon: MessageSquare,
  },
  {
    name: "Canais",
    href: "/dashboard/channels",
    icon: Smartphone,
  },
  {
    name: "Leads",
    href: "/dashboard/leads",
    icon: Users,
  },
  {
    name: "Campanhas",
    href: "/dashboard/campaigns",
    icon: Megaphone,
  },
  {
    name: "Feedback",
    href: "/dashboard/feedback",
    icon: MessageCircle,
  },
  {
    name: "Configuracoes",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-shark-dark">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-shark-blue">
          <Fish className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">SharkPro</h1>
          <p className="text-[10px] font-medium uppercase tracking-wider text-shark-accent">
            AI Automation
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-shark-blue/15 text-shark-blue"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-gray-500">SharkPro V2.0</p>
        <p className="text-[10px] text-gray-600">Powered by ODuo</p>
      </div>
    </aside>
  );
}
