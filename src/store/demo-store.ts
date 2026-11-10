"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  GeneratedReport,
  PricingOverride,
  ScheduledReport,
  UploadedExtraction,
} from "@/data/types";
import { seedBuildings, seedUnits } from "@/data/portfolio-seed";
import {
  veteransComparables,
  veteransRecommendation,
  VETERANS_BUILDING_ID,
} from "@/data/veterans";

interface DemoState {
  hydrated: boolean;
  pricingOverrides: PricingOverride[];
  reports: GeneratedReport[];
  schedules: ScheduledReport[];
  uploads: UploadedExtraction[];
  selectedCompIds: string[];
  recommendation: typeof veteransRecommendation;
  setHydrated: (value: boolean) => void;
  updateUnitRent: (buildingId: string, unitId: string, askingRent: number) => void;
  getUnitRent: (unitId: string, fallback: number) => number;
  toggleComp: (compId: string) => void;
  setSelectedComps: (ids: string[]) => void;
  updateRecommendation: (partial: Partial<typeof veteransRecommendation>) => void;
  addReport: (report: GeneratedReport) => void;
  addSchedule: (schedule: ScheduledReport) => void;
  toggleSchedule: (id: string) => void;
  removeSchedule: (id: string) => void;
  addUpload: (upload: UploadedExtraction) => void;
  updateUpload: (id: string, partial: Partial<UploadedExtraction>) => void;
  resetDemo: () => void;
}

const defaultCompIds = veteransComparables.map((c) => c.id);

const initialReports: GeneratedReport[] = [
  {
    id: "rpt-seed-1",
    buildingId: VETERANS_BUILDING_ID,
    buildingName: "30 Veterans Memorial Parkway",
    unitIds: ["unit-a104", "unit-a210", "unit-a207"],
    unitLabels: ["A104", "A210", "A207"],
    title: "Rental Pricing Analysis — November 9, 2026",
    createdAt: "2026-11-09T14:00:00.000Z",
    preparedBy: "Ria Driscoll",
    recommendedLow: 2075,
    recommendedHigh: 2200,
    status: "generated",
    notes: "Baseline report from source document",
  },
  {
    id: "rpt-seed-2",
    buildingId: VETERANS_BUILDING_ID,
    buildingName: "30 Veterans Memorial Parkway",
    unitIds: ["unit-a104", "unit-a210", "unit-a207"],
    unitLabels: ["A104", "A210", "A207"],
    title: "Weekly Listing Update — Oct 15–22, 2026",
    createdAt: "2026-10-22T16:00:00.000Z",
    preparedBy: "Ria Driscoll",
    recommendedLow: 2075,
    recommendedHigh: 2200,
    status: "generated",
  },
];

const initialSchedules: ScheduledReport[] = [
  {
    id: "sch-1",
    buildingId: VETERANS_BUILDING_ID,
    buildingName: "30 Veterans Memorial Parkway",
    frequency: "weekly",
    nextRun: "2026-11-16T09:00:00.000Z",
    recipients: ["ria@pklmanagement.com", "owner@example.com"],
    enabled: true,
    createdAt: "2026-10-01T12:00:00.000Z",
  },
  {
    id: "sch-2",
    buildingId: VETERANS_BUILDING_ID,
    buildingName: "30 Veterans Memorial Parkway",
    frequency: "twice-monthly",
    nextRun: "2026-11-15T09:00:00.000Z",
    recipients: ["ria@pklmanagement.com"],
    enabled: true,
    createdAt: "2026-10-01T12:00:00.000Z",
  },
];

export const useDemoStore = create<DemoState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      pricingOverrides: [],
      reports: initialReports,
      schedules: initialSchedules,
      uploads: [],
      selectedCompIds: defaultCompIds,
      recommendation: veteransRecommendation,
      setHydrated: (value) => set({ hydrated: value }),
      updateUnitRent: (buildingId, unitId, askingRent) =>
        set((state) => {
          const existing = state.pricingOverrides.filter((o) => o.unitId !== unitId);
          return {
            pricingOverrides: [
              ...existing,
              {
                buildingId,
                unitId,
                askingRent,
                updatedAt: new Date().toISOString(),
              },
            ],
          };
        }),
      getUnitRent: (unitId, fallback) => {
        const override = get().pricingOverrides.find((o) => o.unitId === unitId);
        return override?.askingRent ?? fallback;
      },
      toggleComp: (compId) =>
        set((state) => ({
          selectedCompIds: state.selectedCompIds.includes(compId)
            ? state.selectedCompIds.filter((id) => id !== compId)
            : [...state.selectedCompIds, compId],
        })),
      setSelectedComps: (ids) => set({ selectedCompIds: ids }),
      updateRecommendation: (partial) =>
        set((state) => ({
          recommendation: { ...state.recommendation, ...partial },
        })),
      addReport: (report) => set((state) => ({ reports: [report, ...state.reports] })),
      addSchedule: (schedule) =>
        set((state) => ({ schedules: [schedule, ...state.schedules] })),
      toggleSchedule: (id) =>
        set((state) => ({
          schedules: state.schedules.map((s) =>
            s.id === id ? { ...s, enabled: !s.enabled } : s,
          ),
        })),
      removeSchedule: (id) =>
        set((state) => ({
          schedules: state.schedules.filter((s) => s.id !== id),
        })),
      addUpload: (upload) => set((state) => ({ uploads: [upload, ...state.uploads] })),
      updateUpload: (id, partial) =>
        set((state) => ({
          uploads: state.uploads.map((u) => (u.id === id ? { ...u, ...partial } : u)),
        })),
      resetDemo: () =>
        set({
          pricingOverrides: [],
          reports: initialReports,
          schedules: initialSchedules,
          uploads: [],
          selectedCompIds: defaultCompIds,
          recommendation: veteransRecommendation,
        }),
    }),
    {
      name: "pkl-rent-intelligence-demo",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

export function getBuilding(id: string) {
  return seedBuildings.find((b) => b.id === id);
}

export function getUnitsForBuilding(buildingId: string) {
  return seedUnits.filter((u) => u.buildingId === buildingId);
}

export function getAllBuildings() {
  return seedBuildings;
}

export function getAllUnits() {
  return seedUnits;
}
