"use client";

import { useEffect, useState } from "react";

export type ClientAppMode = "demo" | "live" | "unconfigured" | "unknown";

export type AppModeDetails = {
  mode: ClientAppMode;
  missingEnvVarNames: string[];
  configurationMessage: string | null;
  demoExplicitlyAllowed: boolean;
};

/** Client-side mode from /api/health — never invents live or sample data. */
export function useAppMode(): ClientAppMode {
  return useAppModeDetails().mode;
}

export function useAppModeDetails(): AppModeDetails {
  const [state, setState] = useState<AppModeDetails>({
    mode: "unknown",
    missingEnvVarNames: [],
    configurationMessage: null,
    demoExplicitlyAllowed: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const modeRaw = json.mode ?? json.data?.mode;
        const mode: ClientAppMode =
          modeRaw === "live"
            ? "live"
            : modeRaw === "demo"
              ? "demo"
              : modeRaw === "unconfigured"
                ? "unconfigured"
                : "unconfigured";
        setState({
          mode,
          missingEnvVarNames: json.data?.missingEnvVarNames ?? [],
          configurationMessage: json.data?.configurationMessage ?? null,
          demoExplicitlyAllowed: Boolean(json.data?.demoExplicitlyAllowed),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({
            mode: "unconfigured",
            missingEnvVarNames: [
              "NEXT_PUBLIC_SUPABASE_URL",
              "NEXT_PUBLIC_SUPABASE_ANON_KEY",
            ],
            configurationMessage:
              "Unable to reach health endpoint. Treat as unconfigured — no demo fallback.",
            demoExplicitlyAllowed: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
