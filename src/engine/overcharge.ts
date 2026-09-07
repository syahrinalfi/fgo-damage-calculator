export type OverchargeStage = 1 | 2 | 3 | 4 | 5;

/**
 * Buckets a gauge percentage (100-500) into one of Overcharge's 5 discrete stages —
 * gauge is quantized, not interpolated (research/04-np-gauge-and-refund.md §5.2): a cast
 * NP always resolves at exactly one of `svals`(stage 1)/`svals2`/`svals3`/`svals4`/`svals5`,
 * selected by bracket (100-199% -> 1, 200-299% -> 2, ..., exactly 500% -> 5).
 *
 * Note: research/04 §5.2 also gives a formula, `1 + min(4, floor((gauge% - 1) / 100))`,
 * but that formula does not actually reproduce its own stated brackets (e.g. it buckets
 * 199% into stage 2, not 1) — this implementation follows the bracket description
 * directly instead of the apparently-inconsistent formula text. The exact rounding rule
 * at an exact bracket boundary (e.g. gauge = 200.0%) is still flagged open in that file;
 * this treats each boundary as the start of the next stage, the only self-consistent
 * reading of "100-199% / 200-299% / ..." as stated.
 */
export function overchargeStage(gaugePercent: number): OverchargeStage {
  const stage = 1 + Math.floor((gaugePercent - 100) / 100);
  return Math.min(5, Math.max(1, stage)) as OverchargeStage;
}
