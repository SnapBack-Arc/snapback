import type { ParsedSpec } from "@/lib/estimator/parser";

/**
 * The re-quote gate.
 *
 * A resubmission is a RETRY only if it clears BOTH axes against the session's
 * current spec: SAME SUBJECT and SAME DIFFICULTY. Failing either axis is a topic
 * change regardless of how similar the raw text looked.
 *
 * Everything here compares the parsed spec, never raw text — that is what makes
 * a typo fix ("supplyers" → "suppliers") resolve to the same spec instead of
 * looking like a new topic.
 */

/** A scope change of this factor or more counts as a meaningful difficulty jump. */
export const SCOPE_JUMP_FACTOR = 2;

export type GateOutcome =
  | { pass: true }
  | { pass: false; reason: "subject_changed" | "difficulty_jumped" };

/** Same subject = identical canonical key produced by the parser. */
function sameSubject(prev: ParsedSpec, next: ParsedSpec): boolean {
  return prev.subject_key === next.subject_key;
}

/**
 * Same difficulty = same band AND no meaningful scope jump.
 *
 * The band alone is too coarse: 5 suppliers → 50 suppliers can land in the same
 * band while being a different job, so an order-of-magnitude scope move counts
 * as a jump too (the spec's own example).
 */
function sameDifficulty(prev: ParsedSpec, next: ParsedSpec): boolean {
  if (prev.difficulty !== next.difficulty) return false;

  const a = prev.scope_quantity;
  const b = next.scope_quantity;
  if (a === null || b === null) return a === b; // gaining/losing a quantity is a change
  if (a === 0 || b === 0) return a === b;

  const ratio = Math.max(a, b) / Math.min(a, b);
  return ratio < SCOPE_JUMP_FACTOR;
}

/** Run the combined gate for a resubmission against the session's spec. */
export function evaluateGate(prev: ParsedSpec, next: ParsedSpec): GateOutcome {
  if (!sameSubject(prev, next)) return { pass: false, reason: "subject_changed" };
  if (!sameDifficulty(prev, next))
    return { pass: false, reason: "difficulty_jumped" };
  return { pass: true };
}

/**
 * Free-attempt allowance: the original submission and the 1st retry are free;
 * the 3rd attempt onward is charged a nanopayment into quote-phase escrow.
 */
export const FREE_ATTEMPTS = 2;

export function isChargeable(attemptNo: number): boolean {
  return attemptNo > FREE_ATTEMPTS;
}

/** Session abandonment window — inactivity past this sweeps escrow to Treasury. */
export const ABANDONMENT_MINUTES = 15;
