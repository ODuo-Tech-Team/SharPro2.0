"use client";

import { AdminSidebar } from "@/components/admin/admin-sidebar";

interface AdminShellProps {
  children: React.ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <div className="flex flex-1 flex-col pl-64">
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
