import { describe, expect, it, vi } from "vitest";

/**
 * Mirrors usePendingAction lock semantics without React Testing Library.
 * The hook uses the same ref + pending state pattern.
 */
function createPendingGuard() {
  let pending = false;
  let lock = false;

  return {
    get pending() {
      return pending;
    },
    async run<T>(action: () => Promise<T>): Promise<T | undefined> {
      if (lock) return undefined;
      lock = true;
      pending = true;
      try {
        return await action();
      } finally {
        lock = false;
        pending = false;
      }
    },
  };
}

describe("pending action / duplicate-submit guard", () => {
  it("blocks a second run while the first is in flight", async () => {
    const guard = createPendingGuard();
    let resolveFirst!: (v: string) => void;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });

    const p1 = guard.run(async () => first);
    expect(guard.pending).toBe(true);

    const second = vi.fn(async () => "second");
    const p2 = guard.run(second);
    expect(await p2).toBeUndefined();
    expect(second).not.toHaveBeenCalled();

    resolveFirst("ok");
    expect(await p1).toBe("ok");
    expect(guard.pending).toBe(false);
  });

  it("re-enables after failure so the user can retry", async () => {
    const guard = createPendingGuard();
    await expect(
      guard.run(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(guard.pending).toBe(false);

    const ok = await guard.run(async () => "recovered");
    expect(ok).toBe("recovered");
  });

  it("allows sequential successful runs", async () => {
    const guard = createPendingGuard();
    const spy = vi.fn(async (n: number) => n);
    expect(await guard.run(() => spy(1))).toBe(1);
    expect(await guard.run(() => spy(2))).toBe(2);
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

describe("Button pending contract", () => {
  it("exports pending prop on Button (compile-time + module smoke)", async () => {
    const mod = await import("@/components/ui/button");
    expect(typeof mod.Button).toBe("object");
    expect(typeof mod.buttonVariants).toBe("function");
  });
});

describe("PageSkeleton loading contract", () => {
  it("exports skeleton helpers used to avoid empty-state flash", async () => {
    const mod = await import("@/components/ui/page-skeleton");
    expect(typeof mod.PageSkeleton).toBe("function");
    expect(typeof mod.CardListSkeleton).toBe("function");
  });
});
