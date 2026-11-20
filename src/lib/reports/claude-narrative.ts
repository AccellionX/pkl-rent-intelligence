import Anthropic from "@anthropic-ai/sdk";
import {
  claudeNarrativeResponseSchema,
  type ClaudeNarrativeResponse,
} from "./narrative-schema";
import { buildClaudePromptPayload } from "./sanitize-for-claude";
import { collectAllowedFigures, findDisallowedMoneyFigures } from "./validate-ai-figures";
import type { CanonicalReportPayload, NarrativeSections } from "./types";

export type ClaudeUsageMetrics = {
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
};

export type ClaudeNarrativeResult =
  | {
      ok: true;
      sections: NarrativeSections;
      model: string;
      warnings: string[];
      usedLiveApi: true;
      usage: ClaudeUsageMetrics;
    }
  | {
      ok: false;
      error: string;
      code:
        | "missing_api_key"
        | "api_failure"
        | "invalid_response"
        | "invalid_figures"
        | "blocked_assembly";
      warnings: string[];
      usage?: ClaudeUsageMetrics;
    };

const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-5-20250929";

export function getAnthropicApiKey(): string | null {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  return key || null;
}

function systemPrompt(): string {
  return [
    "You are a pricing analyst assistant for PKL Rent Intelligence.",
    "Draft concise professional narrative sections for a rental pricing report.",
    "Rules:",
    "1. Use ONLY figures and facts present in the JSON payload.",
    "2. Never invent listings, prices, market statistics, or sources.",
    "3. Never change or replace the PKL recommended rent range — only explain it.",
    "4. Keep agent weekly comments separate; do not rewrite them as your voice.",
    "5. If a value is null/missing, say it is unavailable — do not substitute zero or guesses.",
    "6. Weekly metrics are property-wide; do not allocate them to unit types.",
    "7. Distinguish weekly Zillow windows from listing-to-date cumulative metrics.",
    "8. Respond with JSON only matching the required keys.",
  ].join("\n");
}

function userPrompt(promptPayload: Record<string, unknown>): string {
  return [
    "Write narrative sections for this approved report payload.",
    "Return JSON with keys: pricingExplanation, compComparison, marketContext, weeklyPerformance, suggestedActions.",
    "Payload:",
    JSON.stringify(promptPayload),
  ].join("\n\n");
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  return JSON.parse(candidate);
}

/**
 * Call Claude with a sanitized assembly payload.
 * Does not log the prompt payload (may contain client commercial data).
 */
export async function generateClaudeNarrative(
  payload: CanonicalReportPayload,
): Promise<ClaudeNarrativeResult> {
  const warnings: string[] = [];

  if (payload.status === "blocked_conflicts") {
    return {
      ok: false,
      error: "Assembly blocked by unresolved conflicts",
      code: "blocked_assembly",
      warnings: payload.quality.blockers,
    };
  }

  const apiKey = getAnthropicApiKey();
  if (!apiKey) {
    return {
      ok: false,
      error: "AI-assisted writing is currently unavailable.",
      code: "missing_api_key",
      warnings,
    };
  }

  const { promptPayload, warnings: scrubWarnings } = buildClaudePromptPayload(payload);
  warnings.push(...scrubWarnings);

  const model = DEFAULT_MODEL;
  const started = Date.now();
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model,
      max_tokens: 2000,
      temperature: 0.2,
      system: systemPrompt(),
      messages: [{ role: "user", content: userPrompt(promptPayload) }],
    });
    const latencyMs = Date.now() - started;
    const usage: ClaudeUsageMetrics = {
      inputTokens: message.usage?.input_tokens ?? null,
      outputTokens: message.usage?.output_tokens ?? null,
      latencyMs,
    };

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    let parsed: ClaudeNarrativeResponse;
    try {
      parsed = claudeNarrativeResponseSchema.parse(extractJsonObject(text));
    } catch {
      return {
        ok: false,
        error: "AI-assisted writing returned an unexpected format. Please try again.",
        code: "invalid_response",
        warnings,
        usage,
      };
    }

    const sections: NarrativeSections = {
      pricingExplanation: parsed.pricingExplanation.trim(),
      compComparison: parsed.compComparison.trim(),
      marketContext: parsed.marketContext.trim(),
      weeklyPerformance: parsed.weeklyPerformance.trim(),
      suggestedActions: parsed.suggestedActions.trim(),
    };

    const moneyViolations = findDisallowedMoneyFigures(
      sections,
      collectAllowedFigures(payload),
    );
    if (moneyViolations.length) {
      return {
        ok: false,
        error: "AI-assisted writing used unsupported figures. Please regenerate.",
        code: "invalid_figures",
        warnings: [...warnings, ...moneyViolations],
        usage,
      };
    }

    return { ok: true, sections, model, warnings, usedLiveApi: true, usage };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Claude API failure";
    // Avoid echoing request bodies or keys.
    return {
      ok: false,
      error: "AI-assisted writing is temporarily unavailable. Please try again.",
      code: "api_failure",
      warnings: [...warnings, message.slice(0, 120)],
      usage: { inputTokens: null, outputTokens: null, latencyMs: Date.now() - started },
    };
  }
}

/**
 * Deterministic offline draft used by unit tests (never invents outside payload).
 */
export function buildDeterministicNarrativeDraft(
  payload: CanonicalReportPayload,
): NarrativeSections {
  const low = payload.pricing.recommendedRentLow;
  const high = payload.pricing.recommendedRentHigh;
  const blended = payload.pricing.stats.blendedAverageRent;
  const rangeLow = payload.pricing.stats.rangeLow;
  const rangeHigh = payload.pricing.stats.rangeHigh;
  const latest = payload.weekly.latestWeek;

  return {
    pricingExplanation:
      low != null && high != null
        ? `PKL recommends $${low}–$${high} for the ${payload.unitType.label} based on reviewed comps and current subject positioning.`
        : `PKL has not yet set a recommended rent range for this report.`,
    compComparison:
      blended != null && rangeLow != null && rangeHigh != null
        ? `Approved comps support a blended average near $${blended} with an observed range of $${rangeLow}–$${rangeHigh} across ${payload.pricing.stats.eligibleGroupedCount} eligible building group(s).`
        : `Insufficient eligible approved comps are available to summarize a comparison range.`,
    marketContext: `Subject property ${payload.property.name} (${payload.property.city}, ${payload.property.state}) ${payload.unitType.beds}BR/${payload.unitType.baths}BA. Source-set averages are computed only from approved unit-type data.`,
    weeklyPerformance: latest
      ? `For week ${latest.weekStart}→${latest.weekEnd} (property-wide): Zillow weekly leads ${latest.zillow.weekly.totalLeads ?? "unavailable"}; listing-to-date leads ${latest.zillow.listingToDate.totalLeads ?? "unavailable"}; Apartments.com phones ${latest.apartments.phoneCalls ?? "unavailable"}, emails ${latest.apartments.emails ?? "unavailable"}.`
      : `Weekly platform metrics have not been uploaded for this property.`,
    suggestedActions:
      latest?.agent.actionsPlannedNextWeek?.trim() ||
      `Confirm the PKL recommended range, resolve any remaining conflicts, and refresh weekly exports before finalizing.`,
  };
}
