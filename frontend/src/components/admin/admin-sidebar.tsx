"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import Image from "next/image";
import { Users, ArrowLeft, Shield, CalendarCheck } from "lucide-react";

const adminNav = [
  {
    name: "Clientes",
    href: "/admin/clients",
    icon: Users,
  },
  {
    name: "Agendar Reuniao",
    href: "/admin/meetings",
    icon: CalendarCheck,
  },
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-shark-dark">
      {/* Logo */}
      <div className="flex h-16 items-center justify-center border-b border-white/10 overflow-hidden">
        <Image
          src="/LogoShark.png"
          alt="SharkPro"
          width={120}
          height={45}
          className="object-contain invert hue-rotate-[180deg] mix-blend-screen"
        />
      </div>

      {/* Admin badge */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <Shield className="h-4 w-4 text-amber-500" />
        <span className="text-sm font-semibold text-amber-500">Super Admin</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {adminNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-500/15 text-amber-500"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Back to dashboard */}
      <div className="border-t border-white/10 p-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5 flex-shrink-0" />
          Voltar ao Painel
        </Link>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 p-4">
        <p className="text-xs text-gray-500">SharkPro V2.0</p>
        <p className="text-[10px] text-gray-600">Admin Panel</p>
      </div>
    </aside>
  );
}
