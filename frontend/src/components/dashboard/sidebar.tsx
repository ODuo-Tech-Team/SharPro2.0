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
  Building2,
  Brain,
  Sparkles,
  TrendingUp,
  FlaskConical,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
}

const navigation: NavItem[] = [
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
    name: "Simulador",
    href: "/dashboard/simulator",
    icon: FlaskConical,
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
    name: "Gerenciar Empresas",
    href: "/dashboard/admin",
    icon: Building2,
    superAdminOnly: true,
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
      <div className="flex items-center justify-center border-b border-white/10 py-3 px-3">
        <Image
          src="/LogoShark.png"
          alt="SharkPro"
          width={240}
          height={150}
          className="w-full object-contain invert hue-rotate-180 mix-blend-screen brightness-150"
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation
          .filter((item) => !item.superAdminOnly || isSuperAdmin)
          .map((item) => {
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
                    ? item.superAdminOnly
                      ? "bg-amber-500/15 text-amber-500"
                      : "bg-shark-blue/15 text-shark-blue"
                    : "text-gray-400 hover:bg-white/5 hover:text-white"
                )}
              >
                <item.icon className="h-5 w-5 flex-shrink-0" />
                {item.name}
              </Link>
            );
          })}
      </nav>

    </aside>
  );
}
