import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAppMode } from "@/lib/supabase/env";
import { ApiError } from "./errors";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(
    {
      ok: true as const,
      mode: getAppMode(),
      data,
    },
    init,
  );
}

export function jsonError(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        ok: false as const,
        mode: getAppMode(),
        error: {
          code: error.code,
          message: error.message,
          details: error.details ?? null,
        },
      },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false as const,
        mode: getAppMode(),
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.flatten(),
        },
      },
      { status: 400 },
    );
  }

  console.error("[api]", error);
  return NextResponse.json(
    {
      ok: false as const,
      mode: getAppMode(),
      error: {
        code: "internal_error",
        message: "Unexpected server error",
        details: null,
      },
    },
    { status: 500 },
  );
}
