# Task #14A — Global UI/UX quality and interaction standards

**Status:** PARTIAL  
**Date:** 2026-11-18  
**Scope:** Phase 1 customer-facing surfaces only. Design system preserved; no Vercel deploy; no commit/push.

## Summary

Shared interaction, loading, pending-action, label, and error primitives were added and applied across live Phase 1 screens. Regression tests cover friendly errors, status labels, duplicate-submit guards, and “no internal ID labels” source checks. `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` all pass.

Remaining gaps are listed at the end (PARTIAL, not PASS): not every button on every workflow was exercised end-to-end in the browser for pending/spinner behavior; org `<option value={uuid}>` remains correctly internal; some demo-only components still exist behind ModeGate blocks.

## Shared primitives

| Primitive | Location | Role |
|-----------|----------|------|
| Global pointer / not-allowed / focus-visible | `src/app/globals.css` | Consistent cursor + keyboard focus |
| `Button` `pending` | `src/components/ui/button.tsx` | Spinner + disable while async |
| `usePendingAction` | `src/hooks/use-pending-action.ts` | Client-side single-flight submit |
| `PageSkeleton` / `CardListSkeleton` | `src/components/ui/page-skeleton.tsx` | Stable loading layout |
| `toUserFacingError` / `apiErrorMessage` | `src/lib/ui/user-facing-error.ts` | Strip PGRST/SQL/UUID/HTTP jargon |
| Status / source / tier labels | `src/lib/ui/status-labels.ts` | Human enums for UI only |

## Page-by-page matrix

| Page / surface | Pointer / hover | Loading | Duplicate-click | Technical labels | User feedback | A11y | Browser verified |
|----------------|-----------------|---------|-----------------|------------------|---------------|------|------------------|
| Auth / ModeGate | Nav links pointer | Skeleton while mode unknown | N/A | Config screen only | Config message | `aria-busy` on skeleton | Yes — dashboard after session |
| Login | Pointer on CTAs | Existing | Pending on submit (prior) | No IDs | Friendly toasts (prior) | Focus ring | Redirects when already signed in |
| Dashboard | Links / CTAs pointer | `PageSkeleton` | N/A (read) | Org **names** in switcher | Friendly load error | Live region on skeleton | Yes — no UUIDs in body text; pointers OK |
| Properties list | Row / New property pointer | `PageSkeleton` | Create uses `pending` | Property name/address | Friendly create/load errors | Focus-visible | Yes — MLS Subject + address; no UUID text |
| Property detail | Save / nav pointer | `PageSkeleton` | Save `pending` | Report status labels | Friendly save/create errors | Focus-visible | Yes — overview; no raw enums/UUIDs |
| Subject units | Actions pointer | Text loading → content | Save/delete `pending` | Unit status labels | Friendly errors | Confirm delete | Code + prior pass |
| Photo manager | Upload pointer | Loading copy / busy | Upload/crop/delete/reuse gated by `busy` | No bucket jargon in success toast | Friendly errors | Confirm remove | Code path updated |
| Upload | Controls pointer | Processing pending | Submit gated | Org **name**, report **title** select (no UUID field) | Friendly toasts | Labels present | Yes — Organization / Property / Attach to report titles |
| Comparables review | Accept/Exclude pointer | `PageSkeleton` | `busyId` single-flight + `pending` | Source/tier/match/review labels; filename not doc id | Friendly toasts | Buttons disabled while busy | Code + load path |
| Pricing / narrative | Actions pointer | `PageSkeleton` | `busy` early-return + `pending` | Assembly + narrative labels; no model id | Inline status messages | Focus-visible | Navigated (load) |
| PDF reports | Download / finalize pointer | `PageSkeleton` + readiness text | `busy` + `pending` | Assembly/narrative labels; no engine jargon in success | Inline status | `role="status"` | Code + load path |
| Weekly leads | Save pointer | `PageSkeleton` | `saving` guard + `pending` | Property name in chrome | Friendly save/load | Focus-visible | Code + load path |
| Report history | PDF/Pricing links pointer | `PageSkeleton` | N/A (read) | Titles + human status badges | Friendly error card | Empty state CTA | Load verified via /reports |
| Settings / org switcher | Select pointer | Session load | Switch is sync select | Shows org **names**; UUIDs only as option values | N/A | Labeled combobox | Yes — “Active organization” names |

## Tests added

- `tests/unit/user-facing-error.test.ts` — PGRST, 401, UUID strip, FK/duplicate mapping  
- `tests/unit/status-labels.test.ts` — report/unit/narrative/source/tier labels  
- `tests/unit/pending-action.test.ts` — duplicate-submit guard + recovery; Button/PageSkeleton smoke  
- `tests/unit/ui-labels-no-ids.test.ts` — source audit of live surfaces for forbidden ID labels  

## Commands run

```
npm test          # 30 files / 149 tests passed
npm run typecheck # passed
npm run lint      # passed (after set-state-in-effect fixes)
npm run build     # passed (Next.js 16.4.6)
```

## Browser verification notes

Local `next dev` on `:3000` with an authenticated Phase 1 session:

- Dashboard, Properties, Upload, Property overview audited via accessibility snapshot + CDP `getComputedStyle` / body text scan.
- Visible body text: **0 UUIDs**; no `PGRST` / `schema cache` / `Organization ID` labels.
- Interactive links/buttons sampled: `cursor: pointer`.
- Org switcher displays human org names; IDs remain in option `value` (required for selection).

Not fully click-tested in this pass: PDF finalize, narrative generate against live Claude, double-click on every accept/exclude row, photo crop modal, and every empty→loaded transition under slow network.

## Remaining UI/UX issues (why PARTIAL)

1. **Deep workflow click-through** — comps accept/exclude, narrative generate/approve, PDF draft/finalize pending spinners not visually confirmed under load in this session.  
2. **Server idempotency** — client pending guards are in place; sensitive create paths still rely primarily on existing DB uniqueness / API validation rather than new explicit idempotency keys.  
3. **Demo components** still in tree (`demo-*.tsx`) but ModeGate blocks customer demo mount; not redesigned.  
4. **Units / schedule pages** follow ModeGate live path; polish depth matches prior Task #11/#13 more than a fresh pass on every control.  
5. **Org switcher HTML values** still UUIDs (correct); ensure future UI never mirrors `value` into visible labels.

## Strict compliance

- Phase 1 only  
- No demo/sample data fallback for customer paths  
- No Vercel deploy  
- No git commit / push  
- Secrets not exposed in docs or UI  
