"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toUserFacingError } from "@/lib/ui/user-facing-error";

type Props = {
  missingEnvVarNames?: string[];
  message?: string | null;
};

/**
 * Customer-facing unavailable state when the app is not ready.
 * Never list environment variables, infrastructure providers, or setup steps.
 */
export function ConfigurationRequired({ message }: Props) {
  const description = message
    ? toUserFacingError(
        message,
        "Rent Intelligence isn’t available right now. Please contact your administrator.",
      )
    : "Rent Intelligence isn’t available right now. Please contact your administrator.";

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Temporarily unavailable</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-ink-muted">
        <p>If you continue to see this message, reach out to your PKL administrator for help.</p>
      </CardContent>
    </Card>
  );
}
