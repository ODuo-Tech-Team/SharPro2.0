"use client";

import { Sidebar } from "@/components/dashboard/sidebar";
import { TopBar } from "@/components/dashboard/top-bar";

interface DashboardShellProps {
  children: React.ReactNode;
  userEmail?: string;
}

export function DashboardShell({ children, userEmail }: DashboardShellProps) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col pl-64">
        <TopBar userEmail={userEmail} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
