"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ConfigurationRequired } from "@/components/live/configuration-required";
import { useAppModeDetails } from "@/hooks/use-app-mode";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toUserFacingError } from "@/lib/ui/user-facing-error";
import { toast } from "sonner";

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.startsWith("/login")) return "/";
  return raw;
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = safeNext(searchParams.get("next"));
  const modeDetails = useAppModeDetails();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (modeDetails.mode !== "live") return;
    const supabase = createSupabaseBrowserClient();
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        router.replace(nextPath);
        router.refresh();
      }
    });
  }, [modeDetails.mode, nextPath, router]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (modeDetails.mode === "unconfigured" || modeDetails.mode === "demo") {
      const message =
        "Sign-in isn’t available right now. Please contact your administrator.";
      setFormError(message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    if (!supabase) {
      const message =
        "Sign-in isn’t available right now. Please contact your administrator.";
      setFormError(message);
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data.session) {
        const message = toUserFacingError(
          error?.message ?? "Invalid email or password",
          "Unable to sign in. Please check your email and password.",
        );
        setFormError(message);
        toast.error(message);
        return;
      }
      toast.success("Signed in successfully.");
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      const message = toUserFacingError(err, "Unable to sign in. Please try again.");
      setFormError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  if (modeDetails.mode === "unknown") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6 text-sm text-ink-muted">
        Loading…
      </div>
    );
  }

  if (modeDetails.mode === "unconfigured") {
    return (
      <div className="min-h-screen bg-surface">
        <div className="mx-auto max-w-lg px-6 py-10">
          <div className="mb-8 text-center">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
              PKL Management LLC
            </div>
            <h1 className="mt-2 font-display text-3xl font-semibold text-navy">
              Rent Intelligence
            </h1>
          </div>
          <ConfigurationRequired />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-navy text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(201,162,39,0.22),transparent_55%)]" />
      <div className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="mb-8">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-gold">
            PKL Management LLC
          </div>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            Rent Intelligence
          </h1>
          <p className="mt-2 text-sm text-white/65">
            Enter your email and password to continue.
          </p>
        </div>

        <Card className="border-white/10 bg-white text-navy shadow-xl">
          <CardHeader>
            <CardTitle>Sign in to your account</CardTitle>
            <CardDescription>Enter your email and password to continue.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={onSubmit}>
              <div>
                <label htmlFor="login-email" className="mb-1 block text-sm font-medium">
                  Email
                </label>
                <Input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="login-password" className="mb-1 block text-sm font-medium">
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="login-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={busy}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-1 text-ink-muted hover:text-navy"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              {formError ? (
                <p className="text-sm text-rose-700" role="alert">
                  {formError}
                </p>
              ) : null}
              <Button type="submit" variant="gold" className="w-full" pending={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface text-sm text-ink-muted">
          Loading…
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
