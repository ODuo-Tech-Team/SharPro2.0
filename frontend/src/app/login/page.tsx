"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import Image from "next/image";
import { Loader2 } from "lucide-react";

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(
        authError.message === "Invalid login credentials"
          ? "E-mail ou senha invalidos."
          : authError.message
      );
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    if (password.length < 6) {
      setError("A senha precisa ter pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    // Create the organization via RPC (bypasses RLS for signup)
    const orgId = generateUUID();

    const { error: orgError } = await supabase.rpc(
      "create_organization_for_signup",
      { org_id: orgId, org_name: orgName || email.split("@")[0] }
    );

    if (orgError) {
      setError("Erro ao criar organizacao: " + orgError.message);
      setLoading(false);
      return;
    }

    // 2. Sign up the user with org metadata
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          organization_id: orgId,
          role: "admin",
        },
      },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    setSuccess("Conta criada! Fazendo login...");

    // Auto-login after signup
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (loginError) {
      setSuccess("Conta criada! Verifique seu e-mail ou faca login.");
      setLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-shark-dark via-shark-navy to-shark-dark p-4">
      {/* Background decorations */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-shark-blue/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-shark-accent/10 blur-3xl" />
      </div>

      <Card className="relative w-full max-w-md border-white/10 bg-white/5 backdrop-blur-xl">
        <CardHeader className="space-y-4 text-center">
          {/* Logo */}
          <div className="mx-auto">
            <Image
              src="/LogoShark.png"
              alt="SharkPro Logo"
              width={80}
              height={80}
              className="rounded-2xl"
            />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">SharkPro</h1>
            <p className="mt-1 text-sm text-gray-400">
              {isSignUp
                ? "Crie sua conta de automacao IA"
                : "Acesse sua plataforma de automacao IA"}
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <form
            onSubmit={isSignUp ? handleSignUp : handleLogin}
            className="space-y-4"
          >
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="orgName" className="text-gray-300">
                  Nome da Empresa
                </Label>
                <Input
                  id="orgName"
                  type="text"
                  placeholder="Minha Empresa"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  required
                  className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:ring-shark-blue"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-300">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:ring-shark-blue"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-300">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder={isSignUp ? "Minimo 6 caracteres" : "Sua senha"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={isSignUp ? 6 : undefined}
                className="border-white/10 bg-white/5 text-white placeholder:text-gray-500 focus-visible:ring-shark-blue"
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}

            {success && (
              <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
                {success}
              </div>
            )}

            <Button
              type="submit"
              className="w-full bg-shark-blue hover:bg-shark-blue/90"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isSignUp ? "Criando conta..." : "Entrando..."}
                </>
              ) : isSignUp ? (
                "Criar Conta"
              ) : (
                "Entrar"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError(null);
                setSuccess(null);
              }}
              className="text-sm text-shark-blue hover:text-shark-blue/80 transition-colors"
            >
              {isSignUp
                ? "Ja tem conta? Faca login"
                : "Nao tem conta? Cadastre-se"}
            </button>
          </div>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-500">
              Plataforma de atendimento inteligente
            </p>
            <p className="mt-1 text-[10px] text-gray-600">
              Powered by ODuo
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
