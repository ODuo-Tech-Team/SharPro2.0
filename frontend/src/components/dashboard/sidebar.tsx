"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import {
  LayoutDashboard,
  Users,
  Settings,
  MessageSquare,
  Megaphone,
  Smartphone,
  Shield,
  Brain,
  Sparkles,
  TrendingUp,
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
    name: "Treinar Robô",
    href: "/dashboard/training",
    icon: Brain,
  },
  {
    name: "Personalidade",
    href: "/dashboard/personality",
    icon: Sparkles,
  },
  {
    name: "Leads",
    href: "/dashboard/leads",
    icon: Users,
  },
  {
    name: "Follow-up",
    href: "/dashboard/followup",
    icon: TrendingUp,
  },
  {
    name: "Campanhas",
    href: "/dashboard/campaigns",
    icon: Megaphone,
  },
  {
    name: "Configurações",
    href: "/dashboard/settings",
    icon: Settings,
  },
];

interface SidebarProps {
  isSuperAdmin?: boolean;
}

export function Sidebar({ isSuperAdmin }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-shark-dark">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center justify-center border-b border-white/10 overflow-hidden">
        <Image
          src="/LogoShark.png"
          alt="SharkPro"
          width={120}
          height={45}
          className="object-contain invert hue-rotate-[180deg] mix-blend-screen"
        />
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

      {/* Admin link */}
      {isSuperAdmin && (
        <div className="border-t border-white/10 px-3 py-3">
          <Link
            href="/admin/clients"
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-amber-500 transition-colors hover:bg-amber-500/10"
          >
            <Shield className="h-5 w-5 flex-shrink-0" />
            Admin
          </Link>
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-gray-500">SharkPro V2.0</p>
        <p className="text-[10px] text-gray-600">Powered by ODuo</p>
      </div>
    </aside>
  );
}
