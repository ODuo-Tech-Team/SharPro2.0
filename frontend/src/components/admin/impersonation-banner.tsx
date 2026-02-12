"use client";

import { useState, useEffect } from "react";
import { Shield, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState(false);
  const [orgId, setOrgId] = useState("");

  useEffect(() => {
    const imp = localStorage.getItem("impersonating_org");
    if (imp) {
      setImpersonating(true);
      setOrgId(imp);
    }
  }, []);

  const handleExit = () => {
    localStorage.removeItem("impersonating_org");
    localStorage.removeItem("admin_session_backup");
    setImpersonating(false);
    // Redirect back to admin panel
    window.location.href = "/admin/clients";
  };

  if (!impersonating) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[60] flex items-center justify-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <Shield className="h-4 w-4" />
      <span>
        Modo Administrador: Você está acessando como cliente.
      </span>
      <Button
        size="sm"
        variant="outline"
        onClick={handleExit}
        className="h-7 gap-1 border-black/20 bg-transparent text-black hover:bg-black/10"
      >
        <X className="h-3.5 w-3.5" />
        Sair
      </Button>
    </div>
  );
}
