import { Region, type NoblePhantasm, type Skill } from "@atlasacademy/api-connector";
import { getGameDataClient } from "fgo-damage-calculator/data";
import type { ServantBuild } from "fgo-damage-calculator/account";
import type { EquippedCraftEssence } from "fgo-damage-calculator/battle";
import type { ServantSkillSource, SkillSlotSource } from "fgo-damage-calculator/battle";
import type { ServantCandidate } from "fgo-damage-calculator/optimizer";

/**
 * A small, real (not fictional) demo shortlist — the account-setup/roster surface doesn't exist
 * yet, so this stands in for it, but every id here is a genuine Atlas Academy NA servant/CE
 * fetched live at runtime (`PRODUCT.md`'s "live data over hardcoded data" principle), not an
 * invented character. Exactly `FRONT_LINE_SERVANT_COUNT` (3) — keeps the servant-subset axis
 * to a single formation so the demo's search stays fast (only the CE-assignment axis still
 * varies the ranked lines); `optimizeQuest`'s own docs flag full multi-axis combinatorics as
 * "the caller's problem, not this module's."
 */
export const DEMO_SERVANT_IDS = [100100, 200100, 302700] as const; // Altria Pendragon, Emiya, Medusa
export const DEMO_CE_IDS = [9400090, 9400340] as const; // Concentration, Kaleidoscope

const REGION = Region.NA;

function demoBuild(servantId: number): ServantBuild {
  return {
    servantId,
    level: 90,
    ascension: 4,
    skillLevels: [10, 10, 10],
    appendSkillLevels: {},
    npLevel: 5,
    fou: { atk: 2000, hp: 2000 },
    commandCodeIds: [],
  };
}

/** Picks each skill slot's strongest-unlocked version — `Entity.skills` carries every strengthen stage of all 3 slots flattened into one array. */
function pickSkillSlots(skills: readonly Skill.Skill[]): readonly [SkillSlotSource, SkillSlotSource, SkillSlotSource] {
  const bySlot = new Map<number, Skill.Skill>();
  for (const skill of skills) {
    if (skill.num === undefined) continue;
    const current = bySlot.get(skill.num);
    if (current === undefined || (skill.strengthStatus ?? 0) >= (current.strengthStatus ?? 0)) {
      bySlot.set(skill.num, skill);
    }
  }
  const slot = (num: number): SkillSlotSource => {
    const skill = bySlot.get(num);
    return { skill: { functions: skill?.functions ?? [], coolDown: skill?.coolDown ?? [999] }, level: 10 };
  };
  return [slot(1), slot(2), slot(3)];
}

/** Picks the NP's strongest-unlocked version (Interlude/strengthen upgrades append later entries with the same `num`). */
function pickNpGain(nps: readonly NoblePhantasm.NoblePhantasm[]): NoblePhantasm.NoblePhantasmGain {
  const primary = nps.filter((np) => np.num === 1);
  const chosen = primary[primary.length - 1] ?? nps[0];
  if (chosen === undefined) {
    throw new RangeError("Servant has no noblePhantasms entries");
  }
  return chosen.npGain;
}

export interface LiveRoster {
  readonly shortlist: readonly ServantCandidate[];
  readonly cePool: readonly EquippedCraftEssence[];
  /**
   * Raw skill data for `optimizeQuest`'s skill-usage-plan search axis — fetched and built, but
   * **not currently passed to `optimizeQuest`** (`useOptimizerResults.ts` omits `skillSources`
   * deliberately: real skill data explodes that axis's candidate count far past what this
   * in-browser demo can search, see that hook's own doc comment). Kept here, already real and
   * ready, for whenever a narrower per-turn candidate builder makes turning that axis back on
   * feasible.
   */
  readonly skillSources: readonly ServantSkillSource[];
  readonly npGainByServantId: (servantId: number) => NoblePhantasm.NoblePhantasmGain;
}

/** Fetches this demo's real servant/CE roster live from Atlas Academy and assembles the raw-data auto-resolver inputs `optimizeQuest` accepts (`skillSources`/`npGainByServantId`), not hand-rolled `DerivedHitContext`/`SkillActivation` resolvers — see `LiveRoster.skillSources`'s own doc comment for why it isn't actually wired into the search yet. */
export async function fetchLiveRoster(): Promise<LiveRoster> {
  const client = getGameDataClient(REGION);
  const [servants, ces] = await Promise.all([
    Promise.all(DEMO_SERVANT_IDS.map((id) => client.servant(id))),
    Promise.all(DEMO_CE_IDS.map((id) => client.craftEssence(id))),
  ]);

  const shortlist: ServantCandidate[] = servants.map((niceServant) => ({ niceServant, build: demoBuild(niceServant.id) }));
  const cePool: EquippedCraftEssence[] = ces.map((data) => ({ data, level: 1 }));
  const skillSources: ServantSkillSource[] = servants.map((niceServant) => ({ servantId: niceServant.id, skills: pickSkillSlots(niceServant.skills) }));
  const npGainById = new Map(servants.map((niceServant) => [niceServant.id, pickNpGain(niceServant.noblePhantasms)]));

  return {
    shortlist,
    cePool,
    skillSources,
    npGainByServantId: (servantId: number) => {
      const gain = npGainById.get(servantId);
      if (gain === undefined) throw new RangeError(`No fetched NP gain for servantId ${servantId}`);
      return gain;
    },
  };
}

/**
 * A face-icon URL for a fetched servant/CE — `undefined` when the record genuinely has none
 * (never fabricated). Picks the *highest* available ascension stage rather than hardcoding
 * `"1"` — this demo's `ServantBuild`s are all final-ascension (`demoBuild`'s `ascension: 4`),
 * and `extraAssets.faces.ascension` is keyed by stage, so hardcoding `"1"` would always show
 * 1st-ascension art regardless of the build actually being final ascension.
 */
export function faceIconUrl(entity: { readonly extraAssets: { readonly faces?: { readonly ascension?: Readonly<Record<string, string>> } } } | { readonly extraAssets: { readonly faces?: { readonly equip?: Readonly<Record<string, string>> } } }): string | undefined {
  const faces = entity.extraAssets.faces;
  if (faces === undefined) return undefined;
  const ascension = "ascension" in faces ? faces.ascension : undefined;
  if (ascension !== undefined) {
    const stages = Object.keys(ascension)
      .map(Number)
      .filter((n) => !Number.isNaN(n))
      .sort((a, b) => b - a);
    const highest = stages[0];
    if (highest !== undefined) return ascension[String(highest)];
  }
  const equip = "equip" in faces ? faces.equip : undefined;
  if (equip !== undefined) {
    const first = Object.values(equip)[0];
    if (first !== undefined) return first;
  }
  return undefined;
}
