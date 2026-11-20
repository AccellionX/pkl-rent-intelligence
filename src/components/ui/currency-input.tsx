"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CurrencyInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "prefix"
> & {
  value: number | null | undefined;
  onValueChange: (value: number | null) => void;
  /** Allow cents (default false — whole dollars for rent). */
  allowCents?: boolean;
};

function parseCurrencyInput(raw: string, allowCents: boolean): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (!cleaned || cleaned === ".") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (allowCents) return Math.round(n * 100) / 100;
  return Math.round(n);
}

function displayFromValue(
  value: number | null | undefined,
  allowCents: boolean,
): string {
  if (value == null || !Number.isFinite(value)) return "";
  return allowCents ? String(value) : String(Math.round(value));
}

/**
 * Visible $ prefix currency field. Stores numeric values only (no symbols).
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  (
    {
      className,
      value,
      onValueChange,
      allowCents = false,
      disabled,
      id,
      name,
      placeholder = "0",
      ...props
    },
    ref,
  ) => {
    const [text, setText] = React.useState(() =>
      displayFromValue(value, allowCents),
    );
    const [focused, setFocused] = React.useState(false);

    React.useEffect(() => {
      if (!focused) {
        setText(displayFromValue(value, allowCents));
      }
    }, [value, allowCents, focused]);

    return (
      <div
        className={cn(
          "flex h-10 w-full items-center rounded-md border border-border bg-white shadow-sm focus-within:border-gold focus-within:ring-2 focus-within:ring-gold/30",
          disabled && "cursor-not-allowed opacity-50",
          className,
        )}
      >
        <span
          className="select-none pl-3 pr-1 text-sm font-medium text-ink-muted"
          aria-hidden
        >
          $
        </span>
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode={allowCents ? "decimal" : "numeric"}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          className="h-full w-full min-w-0 border-0 bg-transparent py-2 pr-3 text-sm text-navy outline-none placeholder:text-ink-subtle"
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            const parsed = parseCurrencyInput(text, allowCents);
            setText(displayFromValue(parsed, allowCents));
            onValueChange(parsed);
            props.onBlur?.(e);
          }}
          onChange={(e) => {
            const next = e.target.value;
            setText(next);
            onValueChange(parseCurrencyInput(next, allowCents));
          }}
          {...props}
        />
      </div>
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
