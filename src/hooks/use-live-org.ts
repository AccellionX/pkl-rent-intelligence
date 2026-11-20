"use client";

import { useEffect, useState } from "react";
import { useAppMode } from "@/hooks/use-app-mode";

export type LiveOrg = {
  id: string;
  name: string;
  role: string;
  propertyCount: number;
};

type LiveOrgState = {
  loading: boolean;
  authenticated: boolean;
  email: string | null;
  organizations: LiveOrg[];
  organizationId: string | null;
  setOrganizationId: (id: string) => void;
  error: string | null;
  refresh: () => void;
};

const STORAGE_KEY = "pkl-live-organization-id";

/**
 * Resolves the signed-in user's org memberships.
 * Persists active org in localStorage. Prefers a non-empty portfolio when
 * stored selection is missing/invalid to avoid empty-dashboard confusion.
 * On API failure does NOT fall back to demo seed data.
 */
export function useLiveOrg(): LiveOrgState {
  const mode = useAppMode();
  const [tick, setTick] = useState(0);
  const [session, setSession] = useState<{
    authenticated: boolean;
    email: string | null;
    organizations: LiveOrg[];
    organizationId: string | null;
    error: string | null;
    ready: boolean;
  }>({
    authenticated: false,
    email: null,
    organizations: [],
    organizationId: null,
    error: null,
    ready: false,
  });

  useEffect(() => {
    if (mode !== "live") {
      let cancelled = false;
      queueMicrotask(() => {
        if (cancelled) return;
        setSession({
          authenticated: false,
          email: null,
          organizations: [],
          organizationId: null,
          error:
            mode === "unconfigured" || mode === "demo"
              ? "The application isn’t fully set up. Please contact your administrator."
              : null,
          ready: mode !== "unknown",
        });
      });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    fetch("/api/me")
      .then((r) => r.json().then((json) => ({ ok: r.ok, status: r.status, json })))
      .then((res) => {
        if (cancelled) return;
        if (res.status === 401 || res.status === 403) {
          setSession({
            authenticated: false,
            email: null,
            organizations: [],
            organizationId: null,
            error: null,
            ready: true,
          });
          return;
        }
        if (!res.ok || !res.json.ok) {
          setSession({
            authenticated: false,
            email: null,
            organizations: [],
            organizationId: null,
            error: res.json.error?.message ?? "Unable to load your account. Please try again.",
            ready: true,
          });
          return;
        }
        const orgs = ((res.json.data.organizations ?? []) as LiveOrg[]).map((o) => ({
          ...o,
          propertyCount: typeof o.propertyCount === "number" ? o.propertyCount : 0,
        }));
        const suggested =
          (typeof res.json.data.suggestedOrganizationId === "string"
            ? res.json.data.suggestedOrganizationId
            : null) ??
          orgs.find((o) => o.propertyCount > 0)?.id ??
          orgs[0]?.id ??
          null;
        const stored =
          typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
        const storedValid = stored && orgs.some((o) => o.id === stored) ? stored : null;
        // Single org → always that org. Multiple → stored membership preference, else suggested.
        // Never trust localStorage alone without membership validation (storedValid above).
        const preferred =
          orgs.length === 1
            ? orgs[0]!.id
            : (storedValid ?? suggested);
        if (preferred && typeof window !== "undefined") {
          window.localStorage.setItem(STORAGE_KEY, preferred);
        }
        setSession({
          authenticated: true,
          email: res.json.data.user?.email ?? null,
          organizations: orgs,
          organizationId: preferred,
          error:
            orgs.length === 0
              ? "No organization access for this account"
              : null,
          ready: true,
        });
      })
      .catch((err) => {
        if (!cancelled) {
          setSession({
            authenticated: false,
            email: null,
            organizations: [],
            organizationId: null,
            error: err instanceof Error ? err.message : "Session load failed",
            ready: true,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mode, tick]);

  function setOrganizationId(id: string) {
    setSession((prev) => ({ ...prev, organizationId: id }));
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, id);
    }
  }

  if (mode !== "live") {
    return {
      loading: mode === "unknown",
      authenticated: false,
      email: null,
      organizations: [],
      organizationId: null,
      setOrganizationId,
      error: null,
      refresh: () => setTick((t) => t + 1),
    };
  }

  return {
    loading: !session.ready,
    authenticated: session.authenticated,
    email: session.email,
    organizations: session.organizations,
    organizationId: session.organizationId,
    setOrganizationId,
    error: session.error,
    refresh: () => setTick((t) => t + 1),
  };
}
