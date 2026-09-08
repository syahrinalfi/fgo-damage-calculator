# 07 — Mystic Codes: Skill Catalog and Order Change

This file documents the Mystic Code skill system: what mechanic categories MC skills fall into (by `NiceFuncType`, the same taxonomy as servant skills), and the **Order Change** mechanic (mid-battle servant swap) — closing file 00's "Mystic Code mechanics" domain concept.

Sources: the Atlas Academy `nice/{region}/MC/{id}` endpoint (primary — live-fetched this session for all 28 currently-known Mystic Codes, JP region), `basic_mystic_code.json` (primary, id list); the Fate/Grand Order Fandom wiki and GamePress wiki (community-tier, command-card-count claim only, §4); and the project owner's direct gameplay knowledge (session finding, not a written source — the Order Change state-transfer freeze rule, §4, a follow-up pass resolving what was previously this file's only wiki-tier-only gap).

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

No mystic code skill this session used `addIndividuality`/`subIndividuality`/`overwriteBattleclass` (file 06 §2/§4 — both now have live servant-kit examples, e.g. Romulus=Quirinus and Sima Yi/Kazuradrop respectively) — MCs draw only from the "generic support toolkit" subset of the full function taxonomy, consistent with their role as a small, universal, non-servant-specific kit.

## 3. Order Change — mechanism (primary-source confirmed)

`funcType: replaceMember`, `funcTargetType: ptselectOneSub` (select one servant currently on the field, to be replaced by a chosen sub-member), `funcTargetTeam: player`. This is **not** available on every Mystic Code — of the 28 pulled this session, only **3** carry it: MC 20 (Chaldea Combat Uniform), MC 210 (Chaldea Uniform - Decisive Battle), and MC 440 (Normal Chaldea Uniform) — always as the 3rd skill slot, always with identical `svals` (`Rate:1000, Value:1` at every level — a guaranteed-success, single-swap effect with no scaling numeric payload) and identical cooldown curve: **15/15/15/15/15/14/14/14/14/13 turns** across skill levels 1-10 (a shallow decrease, unlike typical servant skill CD curves that drop by 1 every level).

The skill also carries `script.IgnoreBattlePointUp: [3300200]` at every level — an internal flag (points to a "BattlePoint" system used for Master EXP/rewards during the fight) whose exact effect isn't resolved by the schema alone; flagged **open** since it doesn't affect damage/state calculation and is out of scope for this project's modeling but worth noting so it isn't mistaken for something combat-relevant.

## 4. Order Change — state-transfer rules — resolved by the project owner's direct gameplay knowledge

**Previously a genuine citation-standard gap**: neither the Atlas Academy schema (which only exposes the *targeting* mechanism, §3) nor `fgo-docs` documents what happens to a servant's battle state across a swap, and only wiki-tier sources (Fandom, GamePress) were found — both explicitly below `fgo-docs`'s own credibility bar. **Resolved by the project owner's direct gameplay knowledge (this session)**: swapping a servant to the backline (sub-member bench) **freezes its entire state** — buffs (with their remaining `Turn`/`Count` unchanged), debuffs, skill cooldowns, HP, and NP gauge all stop advancing the instant it leaves the field, and resume from **exactly the same state** the moment it's swapped back in. This is a cleaner and more precise rule than the wiki sources' ambiguous "remain static" phrasing (which could have meant "keep ticking unaffected" or "freeze," and left HP/NP gauge unaddressed) — it settles the ambiguity firmly in favor of **freeze, not continue-ticking**.

- **Command cards**: **confirmed and sharpened by the project owner's direct gameplay knowledge (follow-up pass)** — the wiki's "retains the same number of Command Cards" phrasing (Fandom, verbatim above) was ambiguous about *what* is retained (just a count, or the specific cards). The project owner's direct observation settles this precisely: it's the **specific card types**, not just a count, that carry over unchanged — Order Change does **not** deal a fresh hand, re-draw from the card bag, or trigger any reshuffle. The already-dealt hand slot(s) belonging to the outgoing (swapped-out) servant simply get **re-attributed to the incoming servant**: the card type shown in that slot for the rest of the turn is identical to what it was before the swap, only *which servant* that slot's card "belongs to" (whose ATK/buffs/kit the card resolves against if played) changes. This means Order Change is purely a **card-ownership reassignment on the current turn's already-dealt hand**, entirely decoupled from the card-bag depletion mechanic (research/03 §6.5) — it neither draws from nor returns cards to the bag.
- **Engine implication (sharpens the one below) — implemented.** `BattleState.handCards`/`cardBag` are no longer bare card-type values — both are `readonly HandCard[]` (`src/battle/battleState.ts`), a `{ card, servantId }` pair tagging every dealt (and not-yet-dealt) card with the servant it currently resolves against. `buildCombinedCardDeck` (`src/battle/cardDeck.ts`) tags each of the 15 combined-deck cards with its originating front-line servant at build time; `drawCardBagHand`/`shuffleCards` (`src/battle/cardBag.ts`) were genericized (`<T>`) so the bag/shuffle mechanic stays decoupled from that tagging — its own job (which card *types* get dealt, in what without-replacement pattern) is unaffected, exactly as predicted below. `resolveOrderChange` (`src/battle/turnLoop.ts`) re-attributes every hand-card slot owned by the outgoing servant to the incoming one, without touching card type or the bag; `resolvePlayCard` now also validates `Action.playCard.servantId` against the hand slot's actual owner, closing the ownership-check gap this note originally flagged as still-open.
- **Buffs, debuffs, skill cooldowns**: **confirmed frozen** while benched — a servant's `Turn`/`Count` values on every active buff/debuff, and its skill cooldown counters, are held at whatever value they were at the moment of swap-out, and resume counting down only once it's back on the field. This directly answers the "does pre-buffing a benched servant waste duration" question: **no**, since the buff simply doesn't tick down while benched.
- **HP and NP gauge**: **confirmed persisted/frozen** — both hold their exact value from the moment of swap-out and are unchanged on swap-in, consistent with (and now upgrading from assumption to confirmed) the prior working assumption that these are servant-instance properties, not slot properties.
- **Usage limit**: GamePress notes the skill "become[s] useless after losing three servants in a fight," implying Order Change can only ever swap with a servant from the sub-member bench, and once all sub-members are already dead/exhausted (a 3v3 team with all 3 subs used up), there's nothing left to swap in — this is a straightforward consequence of `ptselectOneSub` requiring a live sub-member target, not a separate rule, but it's called out since it materially affects farming-strategy design (Order Change loop strategies are bounded by bench size, not just skill cooldown).

**Engine implication**: `ServantInstance` (file 09 §1) needs no special-casing for "on-field vs benched" ticking — a benched servant's buff `Turn`/`Count`, cooldowns, HP, and NP gauge simply don't advance during the turn-resolution pipeline (file 09 §2) for as long as it's off the field; the engine only needs to resume normal per-turn decrement/advancement once a servant re-enters the front line via `orderChange`. This is now a confirmed rule, not a wiki-tier assumption requiring a live battle-log trace to verify.

## 5. Open items carried forward

- ~~Order Change's buff/debuff/cooldown/HP/NP persistence across a swap (§4)~~ — **resolved by the project owner's direct gameplay knowledge**: frozen while benched, resumes unchanged on swap-in (§4). ~~Command-card retention across a swap~~ — **resolved, and sharpened beyond the wiki-tier source**: the swapped-in servant inherits the exact card types already dealt to that hand slot, not just a matching count; the swap is a pure ownership reassignment on the current turn's already-dealt hand, with no bag interaction (§4).
- `script.IgnoreBattlePointUp`'s exact effect (§3) — schema-visible but unresolved; likely out of scope (Master-facing reward system, not combat math).
- Whether any Mystic Code beyond the 3 found here (20/210/440) gains Order Change in future JP updates — this file reflects a live snapshot, not a guaranteed-permanent list.
- `addIndividuality`/`subIndividuality`/`overwriteBattleclass` family (file 06 §2/§4) — confirmed absent from the MC skill pool specifically, but no longer open for servant kits generally: both mechanisms now have live examples (Romulus=Quirinus, Sima Yi/Kazuradrop).

## 6. Sources

- `https://api.atlasacademy.io/export/JP/basic_mystic_code.json` (live pull, this session — id/name list, 28 MCs)
- `https://api.atlasacademy.io/nice/JP/MC/{id}` (live pull, this session, all 28 ids — full skill/function/buff detail)
- `https://github.com/atlasacademy/fgo-docs` (README/misc-notes, live-fetched this session in full — confirmed **no** Order Change coverage exists in the primary community-doc repo)
- `https://fategrandorder.fandom.com/wiki/Order_Change` (community wiki, **not** the Kyte/nrvnqsr tier — used only for the command-card-retention claim, §4)
- `https://grandorder.gamepress.gg/c/mystic-codes/chaldea-combat-uniform` (community wiki, same caveat — used only for the buff/cooldown-persistence and sub-member-exhaustion claims, §4)
- `05-buffs-and-debuffs.md` (buff Turn/Count duration model, reused for the state-persistence question)
- `06-traits-and-class-mechanics.md` (temporary-trait mechanism cross-check, §2)
