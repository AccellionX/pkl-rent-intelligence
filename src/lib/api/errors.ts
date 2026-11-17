export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function demoModeError() {
  return new ApiError(
    503,
    "demo_mode",
    "Supabase is not configured. The UI remains in explicit demo mode; live API data is unavailable.",
  );
}

export function unauthorizedError(message = "Authentication required") {
  return new ApiError(401, "unauthorized", message);
}

export function forbiddenError(message = "Forbidden") {
  return new ApiError(403, "forbidden", message);
}

export function notFoundError(message = "Not found") {
  return new ApiError(404, "not_found", message);
}

export function validationError(message: string, details?: unknown) {
  return new ApiError(400, "validation_error", message, details);
}

export function conflictError(message: string, details?: unknown) {
  return new ApiError(409, "conflict", message, details);
}
