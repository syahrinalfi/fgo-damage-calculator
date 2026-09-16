import type { NoblePhantasm } from "@atlasacademy/api-connector";
import type { ServantBuild } from "../account/types.js";

/** Stable account key derived from Atlas Academy's quest gate on a strengthened NP version. */
export function npStrengtheningKey(np: NoblePhantasm.NoblePhantasm): string {
  if (np.condQuestId === 0) {
    throw new RangeError(`NP ${np.id} is not gated by a strengthening quest`);
  }
  return `${np.condQuestId}:${np.condQuestPhase}`;
}

function isUnlocked(np: NoblePhantasm.NoblePhantasm, unlocked: ReadonlySet<string>): boolean {
  return np.condQuestId === 0 || unlocked.has(npStrengtheningKey(np));
}

/**
 * Resolves the exact NP version an account build may use. The selected NP disambiguates
 * genuine multi-form servants; quest-gated upgrades are considered only when their canonical
 * quest key is present. Array order and `strengthStatus` are never treated as unlock proof.
 */
export function selectNoblePhantasmVersion(
  noblePhantasms: readonly NoblePhantasm.NoblePhantasm[],
  build: ServantBuild,
): NoblePhantasm.NoblePhantasm | undefined {
  if (noblePhantasms.length === 0) return undefined;

  const unlocked = new Set(build.unlockedStrengthenings ?? []);
  const selected = build.selectedNpId === undefined
    ? undefined
    : noblePhantasms.find((np) => np.id === build.selectedNpId);
  if (build.selectedNpId !== undefined && selected === undefined) {
    throw new RangeError(`selectedNpId ${build.selectedNpId} is not present in servant ${build.servantId}'s NP data`);
  }
  if (selected !== undefined && !isUnlocked(selected, unlocked)) {
    throw new RangeError(`selected NP ${selected.id} is locked by strengthening quest ${npStrengtheningKey(selected)}`);
  }

  const allUnconditional = noblePhantasms.filter((np) => np.condQuestId === 0);
  if (selected === undefined && allUnconditional.length !== 1) {
    throw new RangeError(`servant ${build.servantId} has ${allUnconditional.length} unconditional NP forms; selectedNpId is required`);
  }
  const selectedNum = selected?.num ?? allUnconditional[0]?.num;
  const sameSlot = noblePhantasms.filter((np) => np.num === selectedNum);
  const unconditional = sameSlot.filter((np) => np.condQuestId === 0);

  const baseline = selected ?? unconditional[0];
  if (baseline === undefined) {
    throw new RangeError(`servant ${build.servantId} has no unconditional NP version to use as a baseline`);
  }

  // Atlas can expose multiple unconditional forms under the same NP slot. Their transformation
  // relationship is not encoded by the quest fields, so only the explicitly selected form is safe.
  if (unconditional.length > 1) return baseline;

  return sameSlot
    .filter((np) => isUnlocked(np, unlocked))
    .sort((a, b) => b.priority - a.priority || b.id - a.id)[0] ?? baseline;
}
