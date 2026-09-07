# 07 — Mystic Codes: Skill Catalog and Order Change

This file documents the Mystic Code skill system: what mechanic categories MC skills fall into (by `NiceFuncType`, the same taxonomy as servant skills), and the **Order Change** mechanic (mid-battle servant swap) — closing file 00's "Mystic Code mechanics" domain concept.

Sources: the Atlas Academy `nice/{region}/MC/{id}` endpoint (primary — live-fetched this session for all 28 currently-known Mystic Codes, JP region), `basic_mystic_code.json` (primary, id list), and (for the Order Change state-transfer rules specifically, where **no primary source documents the mechanic at all** — see §4) the Fate/Grand Order Fandom wiki and GamePress wiki, both explicitly flagged as **community-tier, not the Kyte/`blogs.nrvnqsr.com` tier** `fgo-docs` treats as credible — used only because no primary or Kyte-tier source could be found, per the project's citation standard.

---

## 1. Mystic Codes are just a fourth skill slot family — same engine as servant skills

Structurally, a Mystic Code (`NiceMysticCode`, fetched via `/nice/{region}/MC/{id}`) is nothing but a named set of exactly **3 active skills**, each with the identical `NiceSkill` shape used by servants (file 04/05's skill/buff model applies unchanged: `functions[]`, `funcType`, `funcTargetType`, `svals[]`, `coolDown[]` per level, `buffs[]`). There is no separate "Mystic Code function" taxonomy — every mechanic below is a `NiceFuncType` already covered by files 04/05, just packaged into the player's MC slot instead of a servant's kit. This confirms file 00's assumption that MC skills "use the same function/buff engine as servant skills."

**28 Mystic Codes exist as of this session's pull** (id list from `basic_mystic_code.json`, JP): 1 (Chaldea), 20 (Chaldea Combat Uniform), 30 (Mage's Association Uniform), 40 (Atlas Institute Uniform), 50, 60, 70, 80, 90, 100, 110, 120, 130, 150, 160, 170, 190, 210, 240, 260, 330, 340, 360, 410, 430, 440, 460, 470 — mostly event/anniversary-reskin MCs with different flavor but the same handful of recurring mechanic categories.

## 2. Skill catalog by mechanic category (live-verified `funcType` survey across all 28 MCs)

Every MC skill's 1st and 2nd slots draw from a small recurring set of categories; the 3rd slot is where the more distinctive/rare mechanics (Order Change, Command Shuffle, cooldown reduction) tend to sit. Categories confirmed this session, each with at least one concrete live example:

| Category | `funcType` | Live example (MC, skill) |
|---|---|---|
| **Self/ally buff (turn-limited)** | `addStateShort` | MC 1 "Instant Enhancement" (`ptOne`); MC 20 "Buff All Allies" (`ptAll`) |
| **Self/ally buff (count-limited, e.g. Evade)** | `addState` | MC 1 "Emergency Evade" (`ptOne`) — grants buff 284, an Evade-type buff (file 05 §6 pattern) |
| **HP restoration** | `gainHp` | MC 1 "First Aid" (`ptOne`); MC 30 "Cure-All" (`ptAll`) |
| **NP gauge charge** | `gainNp` | MC 30 "Spiritron Transfer" (`ptOne`) |
| **Critical star generation** | `gainStar` | MC 50 "Confident in Victory" (`ptAll` + `self`, two separate `gainStar` functions in one skill — party stars plus a personal/Master bonus) |
| **Enemy debuff** | `addState` targeting `enemy` | MC 20 "Gandr" — grants buff id 178, **Stun** (`type:"donotAct"`, `buffGroup:500`, 1-turn `ProgressSelfTurn`), a single-target hard CC, not a damage skill |
| **Debuff/buff removal (cleanse)** | `subState` | MC 40 "Rain of Isis" (`ptOne`) — dispels a target's debuffs, same `subState` mechanism documented in file 05 §5 |
| **Skill cooldown reduction** | `shortenSkill` | MC 40 "Eyes of Medjed" (`ptOne`) |
| **Enemy NP delay** | `delayNpturn` | MC 90 "Dial Down" (`enemy`) — pushes back the enemy's NP-ready turn, a mechanic not previously catalogued in files 01-06 |
| **Command card reroll** | `cardReset` | MC 30 "Command Shuffle" (`self`, `funcId 530`) — re-draws the player's current hand of 5 cards; confirmed via live `svals` (`Rate:1000` — always succeeds, no `Value` beyond the flag `1`) |
| **Mid-battle servant swap** | `replaceMember` | MC 20/210/440 "Order Change" — see §3-4 below |

No mystic code skill this session used `addIndividuality`/`subIndividuality`/`overwriteBattleclass` (file 06 §2/§4's still-open temporary-trait/class-override gap) — MCs draw only from the "generic support toolkit" subset of the full function taxonomy, consistent with their role as a small, universal, non-servant-specific kit.

## 3. Order Change — mechanism (primary-source confirmed)

`funcType: replaceMember`, `funcTargetType: ptselectOneSub` (select one servant currently on the field, to be replaced by a chosen sub-member), `funcTargetTeam: player`. This is **not** available on every Mystic Code — of the 28 pulled this session, only **3** carry it: MC 20 (Chaldea Combat Uniform), MC 210 (Chaldea Uniform - Decisive Battle), and MC 440 (Normal Chaldea Uniform) — always as the 3rd skill slot, always with identical `svals` (`Rate:1000, Value:1` at every level — a guaranteed-success, single-swap effect with no scaling numeric payload) and identical cooldown curve: **15/15/15/15/15/14/14/14/14/13 turns** across skill levels 1-10 (a shallow decrease, unlike typical servant skill CD curves that drop by 1 every level).

The skill also carries `script.IgnoreBattlePointUp: [3300200]` at every level — an internal flag (points to a "BattlePoint" system used for Master EXP/rewards during the fight) whose exact effect isn't resolved by the schema alone; flagged **open** since it doesn't affect damage/state calculation and is out of scope for this project's modeling but worth noting so it isn't mistaken for something combat-relevant.

## 4. Order Change — state-transfer rules (⚠ community-sourced only, no primary source found)

**This is a genuine citation-standard gap**: neither the Atlas Academy schema (which only exposes the *targeting* mechanism, §3) nor `fgo-docs` (whose README/misc-notes file was fetched fresh this session and contains **no mention of Order Change at all** — confirmed by reading its full table of contents) documents what happens to a servant's battle state across a swap. No `blogs.nrvnqsr.com` (Kyte) post covering this was found either via targeted search. The two sources below are both wiki-tier (Fandom, GamePress) — **explicitly below** the credibility tier `fgo-docs` itself endorses — and are used here only because nothing better exists; treat every claim in this section as **unverified against primary data** until a better source or a live battle-log trace is found:

- **Command cards**: the swapped-in servant keeps the same number of command cards it would have had in its prior field position for that turn (Fandom wiki, verbatim: "The servant that got exchanged to the field retains the same number of Command Cards that turn") — i.e., the swap does not "refresh" a fresh 5-card hand allocation mid-turn; it inherits the slot's card count.
- **Buffs, debuffs, skill cooldowns**: GamePress claims these "remain static on a switched servant" — meaning a servant's own buffs/debuffs/cooldowns keep ticking (or stay frozen at their current turn/count value) whether it's on the field or benched, rather than pausing while benched or resetting on swap-in. This is the single most important claim for a farming/damage simulator to get right (it determines whether pre-buffing a benched servant "wastes" duration while it waits), and it is **exactly the kind of claim this project's citation standard requires flagging rather than assuming** — it is plausible and consistent with `NiceBuffType`'s Turn/Count model (file 05 §7) simply not distinguishing "on-field" vs "benched" as a state dimension, but that inference has not been confirmed against a live battle log this session.
- **HP and NP gauge**: not explicitly stated by either wiki source; the working assumption (also unverified) is that both persist per-servant regardless of field position, since HP/NP are servant-instance properties, not slot properties — no `NiceFunc`/`NiceBuff` mechanism was found that would reset either on `replaceMember`.
- **Usage limit**: GamePress notes the skill "become[s] useless after losing three servants in a fight," implying Order Change can only ever swap with a servant from the sub-member bench, and once all sub-members are already dead/exhausted (a 3v3 team with all 3 subs used up), there's nothing left to swap in — this is a straightforward consequence of `ptselectOneSub` requiring a live sub-member target, not a separate rule, but it's called out since it materially affects farming-strategy design (Order Change loop strategies are bounded by bench size, not just skill cooldown).

**Open item**: a live battle-log trace (via the Atlas Academy "raw" quest-drop or a community frame-data recording) confirming buff/cooldown persistence across a swap would upgrade this from wiki-tier to verified — flagged for a future targeted pass if the simulator's correctness depends on it (it likely will, once farming-optimizer work in file 09 models Order Change loops).

## 5. Open items carried forward

- Order Change's buff/debuff/cooldown/HP/NP persistence across a swap (§4) — wiki-sourced only, not primary-verified.
- `script.IgnoreBattlePointUp`'s exact effect (§3) — schema-visible but unresolved; likely out of scope (Master-facing reward system, not combat math).
- Whether any Mystic Code beyond the 3 found here (20/210/440) gains Order Change in future JP updates — this file reflects a live snapshot, not a guaranteed-permanent list.
- `addIndividuality`/`subIndividuality`/`overwriteBattleclass` family (file 06 §2/§4) — confirmed absent from the MC skill pool specifically; still open for servant kits generally.

## 6. Sources

- `https://api.atlasacademy.io/export/JP/basic_mystic_code.json` (live pull, this session — id/name list, 28 MCs)
- `https://api.atlasacademy.io/nice/JP/MC/{id}` (live pull, this session, all 28 ids — full skill/function/buff detail)
- `https://github.com/atlasacademy/fgo-docs` (README/misc-notes, live-fetched this session in full — confirmed **no** Order Change coverage exists in the primary community-doc repo)
- `https://fategrandorder.fandom.com/wiki/Order_Change` (community wiki, **not** the Kyte/nrvnqsr tier — used only for the command-card-retention claim, §4)
- `https://grandorder.gamepress.gg/c/mystic-codes/chaldea-combat-uniform` (community wiki, same caveat — used only for the buff/cooldown-persistence and sub-member-exhaustion claims, §4)
- `05-buffs-and-debuffs.md` (buff Turn/Count duration model, reused for the state-persistence question)
- `06-traits-and-class-mechanics.md` (temporary-trait mechanism cross-check, §2)
