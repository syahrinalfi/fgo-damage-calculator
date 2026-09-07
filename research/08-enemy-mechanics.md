# 08 — Enemy Mechanics: Rank/Server-Mod, Traits/Resistances, Wave/HP Structure, Break Bars

This file resolves the four items on file 00's roadmap line for file 08: the "enemy rank (Bronze/Silver/Gold)" question specifically flagged by the user as not-to-be-missed, enemy traits/resistances, wave/HP structure, and gauge-break bars. It also closes out remaining open questions from §6 of `00-project-overview.md` regarding enemy-side NP/debuff mechanics.

Sources: the Atlas Academy OpenAPI schema (`QuestEnemy`, `EnemyScript`, `EnemyServerMod`, `EnemyAi`, `EnemyMisc`, `BuffScript`/`Vals` resistance fields — primary), live quest-phase data fetched this session (`/nice/JP/quest/{id}/{phase}`), and `fgo-docs`' `np.md`/misc-notes (already cited in files 02/04/05).

---

## 1. "Enemy rank (Bronze/Silver/Gold)" — not an official Atlas Academy or `fgo-docs` concept; the real mechanism is `EnemyServerMod`

This was explicitly flagged by the user in file 00 §6 as a mechanic not to miss. After searching the full OpenAPI schema for "bronze"/"silver"/"gold" and the credible community sources (`fgo-docs`, Kyte's NP-gain post), **no such 3-tier "enemy rank" terminology or mechanic exists in any primary or Kyte-tier source** — the only schema hits for those three words are `NiceItemBGType` (`zero/bronze/silver/gold/...`), which is purely the **material drop-item icon background color** (a UI/rarity-display concept for items, unrelated to enemies or NP gain). This is worth stating plainly rather than silently dropping the question: **if "Bronze/Silver/Gold enemy rank" is a real player-facing concept, it is either colloquial terminology not captured in any source checked this session, or a conflation with something else** — flagged open rather than assumed.

**What *is* confirmed, and is very likely what the underlying concern was actually about**: `EnemyServerMod` (`QuestEnemy.serverMod`) is a real, per-enemy, per-quest, server-supplied set of three per-mille multipliers:
- `tdRate` — the `enemyServerMod` term in the **attacking** NP-gain formula (file 04's `np.md` citation)
- `tdAttackRate` — the `enemyServerMod` term in the **defending** NP-gain formula
- `starRate` — the `serverRate` term in the crit-star-generation formula (`critstars.md`)

Live-verified this session (`quest/1000001/1`, `quest/94061636/1`): ordinary early-game mobs (Skeletons, a training-quest "Gate" enemy at `lv:10`) all show `{tdRate: 1200, tdAttackRate: 1200, starRate: 0}` — i.e. **120% NP gain, 0% star generation** for that specific quest's enemies. A `danger`-role enemy in the same quest (`勇者の扉`, higher HP, higher level) showed the **identical** `serverMod` values as the `normal`-role enemies in the same wave — **`EnemyRoleType` (`normal`/`danger`/`servant`) does not by itself determine `serverMod`**; the two are independently set per enemy record by quest design, not derived from a rank tier. **Practical modeling consequence**: the engine must read `serverMod` directly per enemy from live quest data (it varies quest-to-quest, sometimes deliberately boosted for training/farming-friendly quests as seen here) — it must not hardcode a 3-tier "Bronze/Silver/Gold" table, because no such fixed table exists in the data.

## 2. Enemy traits and resistances

**Traits**: `QuestEnemy.traits` is a plain `NiceTrait[]` list — the exact same closed 375-value enum documented in file 06, no enemy-specific extension. Enemies get their trait-gated interactions (e.g. "extra damage vs. Undead," Ruler-class NP effects that check `ckOpIndv`) through this identical mechanism — no separate enemy trait taxonomy exists.

**Resistance to debuffs/instant-death** (refining file 05 §4's MISS/GUARD model with the exact toggle fields found this session): the debuff-application function's `BuffScript`/`Vals` object carries **`UseSvtResistRate`** and **`UseBuffResistRate`** — independent boolean flags controlling whether the "target's resistance" term in the `num2 = resistance + random_roll` formula (file 05 §4) should include (a) the target's own innate/base resistance stat and/or (b) any resistance-type buffs currently on the target. A separate **`IgnoreResistance`** flag lets a specific function bypass the resistance check entirely (a guaranteed-apply debuff, regardless of the target's stats/buffs). This means "an enemy is immune to Stun" is not a hardcoded special-case in the engine — it's the general resistance formula with a resistance value high enough (via base stat and/or buff) that no roll can beat it, exactly the same mechanism used for player-side debuff resistance.

**Instant death** is its own `funcType: instantDeath` (confirmed in the `NiceFuncType` enum), resolved against a base **`instantDeathChance`** field present on `NiceServant` (and the enemy-record equivalent `QuestEnemy.deathRate`) — both per-mille "susceptibility" values, not a flat immunity flag. A `upResistInstantdeath`/`upNonresistInstantdeath` buff-type pair exists (confirmed in `NiceBuffType`), meaning instant-death resistance stacks the same additive way as any other numeric buff (file 05 §2) on top of the base `deathRate`/`instantDeathChance` value — a boss with `deathRate: 0` would be a hard, stat-level immunity (common for story-relevant/named enemies) rather than needing a scripted flag. `NiceConstant.USE_NEW_LOGIC_PREVENT_INVISIBLE_WHEN_INSTANT_DEATH` (confirmed present, value `1`) hints at a client-side visual-only interaction between instant-death and invincibility with no further detail found — flagged open, likely out of scope for damage-only modeling.

**Other per-enemy "Luck/Magic/Agility rank"-flavored stats**: `criticalRate` and `recover` are additional plain integer fields on `QuestEnemy` (alongside `deathRate`) — Kyte's NP-gain-era community notes (cross-referenced against the cached forum thread this session) describe `criticalRate` as tied to the enemy's effective Luck parameter and `deathRate` to Magic, consistent with these being real, direct numeric knobs per enemy record rather than derived from class/rank. No live numeric-effect formula for these two (beyond the schema field names themselves) was pinned down this session — flagged open, lower priority since neither the current damage-only scope nor near-term farming-optimizer work depends on modeling enemy crit/instant-death behavior *against* the player.

## 3. Wave/HP structure — reconfirms and closes prior findings, no new data model needed

This item was already substantially resolved by `01-data-sources.md` (see `00-project-overview.md` §4's "Multi-bar/segmented enemy HP" and "Enemy reinforcement/spawn-on-death" entries): a wave is a flat list of independent `QuestEnemy` records; multi-bar bosses and reinforcements are both just "one enemy record replaced/joined by another," not a bespoke nested structure. This session's live quest pulls (`1000001`, `94061636`) reconfirm the flat-list shape in practice — a 3-wave quest is simply 3 separate `stages[].enemies[]` arrays, each entry a fully self-contained `QuestEnemy` (own HP/level/traits/serverMod/skills/AI), matching the "wave = list of independent enemy unit records" decision already recorded in file 00 §3.

## 4. Gauge-break bars — confirmed to be the exact same mechanism as multi-bar HP, on Atlas Academy's own naming

This closes the file 00 roadmap item cleanly: `EnemyScript.shift` (an array of NPC IDs) is Atlas Academy's own field, and **its schema title is literally `"Break bar switch to these NPC IDs"`** — i.e., what the community calls a boss's "break bar" (or "gauge-break bar") **is not a separate mechanic from the multi-bar/segmented-HP structure already resolved in file 01** — it is the *same* `shift` field, just applied to the specific case of a boss's HP-bar-emptying transition (as opposed to `call`, which is "summon a new/additional NPC," a materially different trigger already distinguished in file 00 §4). No live example enemy record with a populated `shift` array was captured this session (would require locating a specific multi-bar raid/CQ quest ID, not attempted here) — the mechanism is schema-confirmed via the field's own official title text, consistent with this project's standard of treating Atlas Academy's own schema descriptions as primary-source-equivalent (same treatment given to `NiceBuff.vals`' dispel-target description in file 05). Flagged as a live-example gap, not a mechanism gap.

**Practical consequence, reconfirmed**: no bespoke "break bar" data structure is needed in the engine beyond what file 01/00 already decided — `shift` and `call` are the two enemy-transition triggers or bars/reinforcements are keyed off (HP-empty vs. death/turn/threshold respectively), and both resolve to "swap in this other already-present enemy record."

## 5. Open items carried forward

- "Enemy rank (Bronze/Silver/Gold)" (§1): no matching official mechanic found; `EnemyServerMod` is the confirmed real substitute, but if the user has a specific in-game screen or community post in mind describing an actual 3-tier rank system, it should be pointed to directly rather than assumed absent.
- `criticalRate`/`recover` fields' exact numeric effect formulas (§2) — schema-visible, not derived from live data this session.
- A live example of `EnemyScript.shift` (break-bar transition) populated on a real multi-bar boss (§4) — schema/title-confirmed, no live instance captured.
- `NiceConstant.USE_NEW_LOGIC_PREVENT_INVISIBLE_WHEN_INSTANT_DEATH`'s exact interaction (§2) — likely cosmetic/out of scope, not resolved.
- The exact source of the "target's resistance" base value when `UseSvtResistRate` is true (§2) — confirmed as a toggle, not yet traced to a specific named stat field on `NiceServant`/`QuestEnemy`.

## 6. Sources

- Atlas Academy OpenAPI schema: `QuestEnemy`, `EnemyScript` (`shift`/`call`/`hpBarType`/`raid`/`superBoss` fields), `EnemyServerMod`, `EnemyRoleType`, `NiceItemBGType`, `BaseVals`/`Vals` (`UseSvtResistRate`/`UseBuffResistRate`/`IgnoreResistance`), `NiceBuffType` (`upResistInstantdeath`/`upNonresistInstantdeath`), `NiceFuncType` (`instantDeath`), `NiceServant.instantDeathChance`, `NiceConstant.USE_NEW_LOGIC_PREVENT_INVISIBLE_WHEN_INSTANT_DEATH`
- `https://api.atlasacademy.io/nice/JP/quest/1000001/1` and `.../94061636/1` (live pulls, this session — wave/enemy/serverMod structure)
- `fgo-docs` `np.md` / misc-notes (already cited in files 02/04/05) — `enemyServerMod` term definitions
- `01-data-sources.md`, `00-project-overview.md` §4 (multi-bar HP / reinforcement mechanism, already resolved, reconfirmed here)
- `05-buffs-and-debuffs.md` §4 (MISS/GUARD resistance formula, refined here with `UseSvtResistRate`/`UseBuffResistRate`/`IgnoreResistance`)
