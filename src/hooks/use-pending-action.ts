"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Guards against double-submit: only one async action runs at a time.
 * Re-enables on settle (success or failure).
 */
export function usePendingAction() {
  const [pending, setPending] = useState(false);
  const lock = useRef(false);

  const run = useCallback(async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current) return undefined;
    lock.current = true;
    setPending(true);
    try {
      return await action();
    } finally {
      lock.current = false;
      setPending(false);
    }
  }, []);

  return { pending, run };
}
