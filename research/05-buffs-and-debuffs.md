# 05 — Buffs and Debuffs

This file documents the buff/debuff system as a whole: the type taxonomy, how a buff's numeric value resolves (recap + extension of file 02 §3), stacking and unstacking rules, conditional (trait-gated) buffs, duration/consumption models, buff removal (dispel), and the Evade/Invincible/Guts family in detail — closing the items file 00/01/04 explicitly deferred here.

Sources are the same tier used throughout this project: Atlas Academy's own `fgo-docs` repo (primary, official — `deeper/battle/buff.md` and the rendered doc site `https://atlasacademy.github.io/fgo-docs/`), the Atlas Academy OpenAPI schema (primary, official — field descriptions on `NiceBuff`, `BuffScript`, `Vals`, `NiceFuncType`, `NiceBuffType`), and **live Atlas Academy API data** pulled fresh this session for concrete field-level examples (Heracles' bond CE Guts, Cú Chulainn's Evade, Nero Bride's NP Invincible, Dobrynya's trait-gated buff). Where a claim rests on inference from schema shape rather than an explicit doc sentence, it is labeled as such.

---

## 1. What a "buff" is, structurally

A buff is not a monolithic effect — it is the combination of:

1. A **`NiceBuffType`** (239 enum values as of this session — e.g. `upAtk`, `downDefence`, `guts`, `avoidance`, `invincible`, `avoidState`, `pierceInvincible`). The type determines *which buff action* the buff feeds into (see §2) or, for the non-numeric types (`guts`, `avoidance`, `invincible`, `donotAct`, etc.), which special-case game rule applies.
2. A **`buffGroup`** integer, used only for the unstacking rule (§3).
3. A **`vals`/`ckSelfIndv`/`ckOpIndv`** trait triple: `vals` = the buff's own individuality tags (used as the *target* of dispel/buff-removal effects — see §5), `ckSelfIndv` = a trait the buff **holder** must have for the buff to take effect, `ckOpIndv` = a trait the **target being acted on** must have (only relevant for buffs whose action targets an opponent, e.g. a DEF-down debuff that only applies its penalty "vs Male").
4. A **`script`/`BuffScript`** object — a large grab-bag of conditional/behavioral fields (checked below in §4) that isn't covered by the four fields above (e.g. `NotPierceIndividuality`, `HP_LOWER`/`HP_HIGHER`, `avoidanceText`/`gutsText`/`missText`, `CheckOpponentBuffTypes`).
5. A **`maxRate`** — the buff's own contribution to the upper/lower clamp for its buff action (file 02 §3).

A buff is *granted* by a `NiceFunction` of `funcType` `addState` (or one of its variants: `addStateShort`, `addStateToField`, `addStateShortToField`) with a `Turn`/`Count`/`Value`/`Value2`/`Rate` payload per Overcharge level (`svals`/`svals2`/.../`svals5`, confirmed quantized to exactly 5 stages in file 04 §5.2). The function, not the buff type alone, is what carries the actual numeric magnitude and duration for a specific skill/NP's instance of that buff.

Source: `NiceBuff`/`BuffScript`/`Vals` schemas (Atlas Academy OpenAPI), and `NiceFuncType` enum.

---

## 2. Buff-action resolution (recap of file 02 §3, restated for completeness)

Every numeric buff (ATK up, DEF down, NP-gain up, etc.) ultimately resolves through one **buff action** (e.g. `atk`, `commandNpAtk`, `dropNp`, `criticalDamage`). Source: [`buff.md`](https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/buff.md):

```python
num = buffAction.baseParam + (total plusTypes buffs values) - (total minusTypes buff values)

if buffAction.limit in (normal, lower):
    if num < 0:
        num = 0

num = num - buffAction.baseValue

if buffAction.limit in (normal, upper):
    if maxRate < num:
        num = maxRate

return num
```

- Each `NiceBuffType` is registered as either a `plusTypes` or `minusTypes` contributor to exactly one buff action (e.g. `upAtk` is a `plusTypes` contributor to action `atk`; `downAtk` is a `minusTypes` contributor to the same action) — this is what lets "10% ATK up" and "5% ATK down" net to "+5%" before any cap is applied.
- **Stacking within one action is additive** (summed as integers), **then clamped** by `maxRate` (upper bound) and by the `limit` field's floor rule (usually 0). This is the authoritative stacking model for every plain numeric buff — confirmed with the worked Merlin/Hero-Creation example in file 02.
- The official doc site table "Lower and upper bounds of buffs" (`https://atlasacademy.github.io/fgo-docs/#lower-and-upper-bounds-of-buffs`) gives concrete default/floor/ceiling values per action, e.g. `atk`/`atkMod`: default 100%, bound `[0%, 500%]`; `damage`/`powerMod`: default 0%, bound `[N/A, 1000%]` (this 1000% ceiling is the "maximum value of total powerMod" the site documents separately). These are **per-action constants**, not something the engine derives — they must be read from that table (or the live `maxRate` field) per action, not hardcoded once.

**This is the complete resolution model for every "percentage" buff type.** The remainder of this file covers the buff types that do *not* resolve through this arithmetic (Evade, Invincible, Guts, crowd-control, dispel) and the cross-cutting conditional/stacking/duration rules that apply to *all* buff types, numeric or not.

---

## 3. Stacking: additive-within-action vs. unstackable buff groups

Two independent stacking mechanisms exist, and they answer two different questions:

1. **"How do multiple sources of the same buff action combine?"** → additive-then-clamped, per §2. This applies to ordinary percentage buffs (ATK up, NP gain up, etc.) and is *always* how they combine — there is no per-buff opt-out.
2. **"Can two buff *instances* (often of different types) coexist on the same unit at all?"** → the **`buffGroup`** field, documented on the official site as "Unstackable buffs" (`https://atlasacademy.github.io/fgo-docs/#unstackable-buffs`):

   > Buffs which have the same non-zero buff group are unstackable.

   Concrete cited examples from the doc site:
   - Gorgon's Petrify and Plugsuit's Stun both use `buffGroup` 500 → **can't coexist** (per the confirmed collision rule below: whichever lands first holds the slot, and the other is simply rejected on reapplication — not a replace).
   - Heracles' bond-CE Guts is `buffGroup` 600 and his post-strengthening 3rd-skill Guts is `buffGroup` 601 → **different groups, so they stack** (both revive counts persist independently).
   - Cú Chulainn's 2nd-skill Evade and the CE *Under the Sun*'s Evade both use buff 151 (`buffGroup` 200) → **can't stack** (this was verified live this session — see §6.1).
   - Most "Buster Up" buffs share `buffGroup` 0 → **`buffGroup` 0 means "no restriction," always stackable** with anything, including copies of itself.

   **Engine rule**: when applying a new buff, check whether the target already carries a buff with the same non-zero `buffGroup`; if so, the new application does not add a second independent instance, and per the confirmed tie-break rule below, does not modify the existing instance either — it is simply wasted. **Sourcing note (follow-up pass)**: the official doc site's own examples (Petrify/Stun sharing group 500, Cú's Evade skill vs. the CE sharing buff 151/group 200) establish *that* the two don't coexist, and community gameplay-mechanics threads (GameFAQs) independently describe count-based Evade/Invincible/"Solemn Defense"-style buffs as consumed in a fixed priority order when a unit holds several defensive layers at once (highest-tier defense consumed first: Anti-Enforcement/Solemn-Defense-style buffs, then Invincible, then Evade) — but this describes *consumption order across different buff families*, not the collision rule below.

   **buffGroup collision tie-break — resolved by a live in-game test (project owner, this session)**: using the cross-source `specialInvincible`/`buffGroup: 250` pair identified in §6.3 (Avalon le Fae's NP, `Turn: 3`, vs. Altria Caster (Berserker)'s NP, `Turn: 1`), the project owner cast Avalon le Fae's NP first, then — while it was still active — cast Altria Caster (Berserker)'s NP on the same unit. Result: **no change at all** — the existing `Turn: 3` instance was completely unaffected by the second application. This confirms **reject-new**: when a new buff application shares a non-zero `buffGroup` with an already-active instance, the new application is wasted outright (the existing instance's remaining `Turn`/`Count` is untouched) — not replace, not refresh. This also retroactively confirms the project owner's earlier Petrify-vs-Stun recollection (§3 note, now folded into this entry) was correct. **Engine implication**: when applying a buff, if the target already carries an active (non-expired) instance of the same non-zero `buffGroup`, discard the new application entirely and leave the existing instance's `Turn`/`Count` untouched — do not overwrite, do not extend. This is now a confirmed rule, not a placeholder assumption.

**These two mechanisms are orthogonal and both matter**: two "ATK up" buffs from different skills normally have `buffGroup` 0 (stack, then sum-and-clamp via §2); two "Evade" buffs from different sources sharing a non-zero `buffGroup` do *not* both exist as separate count/turn trackers — only one Evade "slot" of that group is active at a time.

---

## 4. Conditional (trait/class/attribute/field-gated) buffs

Confirmed live this session on a real function (Dobrynya Nikitich's "Anti-Dragon Combat (Near Water) EX" skill, fetched from `GET /nice/NA/servant/419`):

```json
{
  "name": "STR Up vs. Dragon",
  "type": "upAtk",
  "ckOpIndv": [{ "id": 2002, "name": "dragon" }]
}
```

This is the exact mechanism file 00 §4 flagged (the Koyanskaya-of-Light-style "unconditional + trait-gated" pattern): the buff's **`ckOpIndv`** field lists the trait(s) the *target of the buff's action* must carry for that buff's contribution to count. `ckSelfIndv` is the mirror-image check on the **buff holder** instead (e.g. a passive that only applies "if self is Female"). Both are lists of `NiceTrait`, so multi-trait gates are structurally supported, but AND vs. OR semantics were not confirmed by any live example across two research passes this session.

**Engine default (project owner's call, unconfirmed)**: until a real counterexample turns up, treat a multi-trait `ckSelfIndv`/`ckOpIndv` list as **AND** (every listed trait must be present on the checked unit) — this is a provisional default chosen to unblock implementation, not a sourced rule, and should be revisited the moment a contradicting example surfaces. The project owner also raised, without confirming, the possibility that the real rule might not be a single blanket AND/OR but could vary by trait-category (their own example: `[Male, classServant]` "feels like" it should be AND, `[Male, dragon]` "feels like" it should be OR) — this is flagged as an unconfirmed hypothesis only, not implemented, since it isn't sourced from any live example either and a category-dependent rule would need its own confirmed logic for *which* categories combine which way.

A second, more expressive conditional layer lives in **`BuffScript`** (confirmed via schema, not yet matched to a live example this session):
- `INDIVIDUALITIE_AND` / `INDIVIDUALITIE_OR` / `INDIVIDUALITIE_COUNT_ABOVE` / `INDIVIDUALITIE_COUNT_BELOW` — richer trait-count conditions than a plain single-trait check.
- `ckSelfCountIndividuality` / `ckOpCountIndividuality` + `ckIndvCountAbove` / `ckIndvCountBelow` — "applies only if the holder/target has at least/at most N traits from this set" (e.g. field-count-gated effects).
- `HP_LOWER` / `HP_HIGHER` — HP-percentage-gated buff activation (relevant to "execute"-style or "berserk-when-low-HP" kits).
- `CheckOpponentBuffTypes` — the buff only applies if the opponent currently carries a specific `NiceBuffType` (e.g. "bonus damage vs. targets that are Charmed").
- `TargetIndiv` / `UpBuffRateBuffIndiv` — further individuality-based scope/scaling fields.

Field-type buffs (Sky/Land/Sea battlefield bonuses referenced in file 00 §4) use the dedicated `fieldIndividuality`/`subFieldIndividuality` buff types plus `funcTargetType` values `fieldAll`/`fieldOther`/`fieldRandom`/`toFieldChangeField`/`toFieldSubIndividualityField` — confirming fields are modeled as a trait tag applied to the battlefield itself, checked the same way as a unit trait, not a separate subsystem.

**Engine implication**: a function/buff's applicability check must evaluate, per potential target and per potential holder: (a) `ckSelfIndv`, (b) `ckOpIndv`, (c) any populated `BuffScript` conditional field — all as AND-ed gates before the buff's magnitude is added into its buff action's running sum (§2). None of this is optional per-buff scaffolding; it's the same evaluation pipeline for every conditional buff regardless of kind (class/attribute/trait/field/HP-threshold/opponent-buff-state).

---

## 5. Buff removal (dispel) and buff-targeting by trait

`NiceFuncType` includes a dedicated removal family, distinct from `addState`:

| funcType | Meaning (from enum naming + context) |
|---|---|
| `subState` | Remove (dispel) an existing buff/debuff matching a trait filter |
| `releaseState` | A second, structurally separate removal type in the schema's `NiceFuncType` enum |
| `addStateFuncType169` / `addStateFuncType170` | Unnamed/placeholder-named `addState` variants (Atlas Academy hasn't assigned semantic names yet) |

**Follow-up pass — `releaseState` is empirically unused, but the distinction stays open**: live-queried `https://api.atlasacademy.io/nice/{NA,JP}/function/search?type=releaseState` this session — both regions return `[]` (zero matching functions in current game data). Cross-checked `/raw/JP/function/search?type=releaseState` too — also empty. `releaseState` is a real, distinct enum value in the game's own `funcType` taxonomy (it's extracted directly from the client's IL2Cpp dump by Atlas Academy's `extract_enums.py`, not invented by Atlas Academy), so it isn't a schema artifact — but as of this session no skill, NP, CE, or passive in either live region actually uses it. **Per the project owner's explicit call, this is left as an open item rather than marked resolved**: zero live cases means there's no evidence to derive the actual distinction from, not that the question has an answer. Non-blocking for the engine today — only `subState`'s dispel-by-trait behavior has any live instances to implement against — but should be revisited (not assumed identical) if a future game update ever puts a skill/NP on `releaseState`. Source tier: primary (direct Atlas Academy API query, both regions, this session) for the usage-count fact; the semantic distinction itself remains unsourced.

A dispel function targets buffs **by trait**, not by buff ID — this is exactly why `NiceBuff.vals` exists: per its own schema description, *"Buff traits/individualities. For example, buff removal uses this field to target the buffs."* So "remove all debuffs," "remove all buffs granting the `buffPositiveEffect` trait," etc. are all expressed as a `subState` function whose own `functvals`/target-trait filter is matched against each existing buff's `vals` list — the same trait-matching machinery used everywhere else in the buff system (§4), just applied to *removing* buffs instead of gating their application.

Concretely, from the live examples pulled this session, every buff's `vals` carries generic classification traits alongside its gameplay tag — e.g. Guts's `vals` includes `buffPositiveEffect` + `buffGuts`; Evade's includes `buffPositiveEffect` + `buffEvadeAndInvincible` + `buffEvade` + `buffIncreaseDefence`; Invincible's includes the same `buffEvadeAndInvincible` shared tag plus `buffInvincible`. This confirms Evade and Invincible share a common dispellable/checkable "family" trait (`buffEvadeAndInvincible`) distinct from their individual `buffEvade`/`buffInvincible` tags — a "remove Evade or Invincible" effect can target the shared trait; a "remove Evade specifically" effect targets the narrower one.

**Invincible-piercing is a separate mechanism from dispel**: `pierceInvincible`/`pierceSpecialInvincible`/`breakAvoidance` (file 01 §6.4) are buff types granted to the **attacker**, checked at damage-resolution time — they don't remove the defender's Invincible/Evade buff, they just ignore it for that hit. `BuffScript.NotPierceIndividuality` (a nested trait-list array) is the inverse: a way for a specific Invincible/Evade instance to declare itself immune to piercing from attacks carrying certain traits — confirmed present in schema, live example not yet found (flagged **open**, low priority).

---

## 6. Evade, Invincible, and Guts — concrete field-level confirmation

File 01 (§6.3–6.4) already established the *structural* model (distinct buff types; `Turn` vs `Count` as two independently-nullable fields on the same `Vals` object). This session pulled three live examples to confirm the model with real numbers and close the remaining "which field means what, concretely" gap.

### 6.1 Evade — Cú Chulainn's "Protection from Arrows B" (`GET /nice/NA/servant/17`)

```json
{
  "buffs": [{ "type": "avoidance", "buffGroup": 200, "detail": "Reduce ATK damage taken to 0" }],
  "svals": [{ "Rate": 1000, "Turn": -1, "Count": 3 }]
}
```
`Turn: -1` (no turn-based expiry — sentinel for "unlimited/not turn-limited") + `Count: 3` → a **count-based** Evade good for 3 hits, confirming file 01's model precisely: a count-based instance has `Turn` at its "unlimited" sentinel value (`-1`) and a real, finite `Count`. `buffGroup` 200 matches the doc site's cited unstackable-group example exactly (Cú's skill vs. the *Under the Sun* CE), confirming this is the same buff the doc site discusses.

### 6.2 Guts — Heracles' bond CE (`GET /nice/JP/equip/197`)

```json
{
  "buffs": [{ "type": "guts", "buffGroup": 600, "detail": "HPが0になった時、HPを回復して耐える" (“When HP reaches 0, recover HP and endure”) }],
  "svals": [{ "Rate": 1000, "Turn": -1, "Count": 3, "Value": 500 }]
}
```
`buffGroup` 600 matches the doc site's cited example exactly. `Count: 3` = 3 revives; `Value: 500` = revive to **50%** HP (confirms the per-mille scaling convention used everywhere else in this project — 1000 = 100%, matching `dropNp`/`atk`/etc.). `Turn: -1` = no outer turn-window ceiling on this particular instance — it lasts until the 3 revive charges are used or the buff is dispelled/overwritten by its group, whichever first.

### 6.3 Invincible — Nero Bride's NP (`GET /nice/NA/servant/59`)

```json
{
  "buffs": [{ "type": "invincible", "buffGroup": 400, "detail": "Ignore Sure Hit and reduce ATK damage to 0" }],
  "svals": [{ "Rate": 1000, "Turn": 1, "Count": -1 }]
}
```
Here it's the reverse: `Turn: 1` (expires after exactly 1 turn) + `Count: -1` (no hit-count limit — sentinel for unlimited) → a **turn-based** Invincible that blocks every hit for one full turn regardless of how many times the unit is attacked, exactly matching file 01's other predicted case. This is the cleanest possible confirmation that `Turn`/`Count` each independently take a real value **or** a `-1` "not limited on this axis" sentinel — never both populated with real numbers on the sampled instances, though the schema doesn't forbid it, so the engine should still treat them as two independent expiry checks (a buff ends when *either* its turn countdown or its use-count reaches zero, whichever comes first) rather than assuming exactly one is ever meaningful.

**"Sure Hit" mechanism — resolved, with an asymmetric scope (corrected after an initial back-and-forth this session).** Invincible's own detail text ("Ignore Sure Hit") is confirmed to mean exactly what it says: `breakAvoidance` (already named in this file's §5 line above, from file 01 §6.4, but not previously connected to the community term "Sure Hit") **is** Sure Hit — a dedicated `NiceBuffType` granted to the **attacker**. Its scope is narrow: it pierces `avoidance` (Evade) **only**, not `invincible`. `pierceInvincible`, by contrast, is confirmed (project owner's direct gameplay experience, after an initial mis-recollection was itself corrected) to be the **broader** counter — it pierces **both** `invincible` and `avoidance`, matching the community-source read (GamePress Q&A, GameFAQs) that this project's first pass at this topic had briefly (incorrectly) discarded. So the two counters are not symmetric/parallel: Sure Hit (`breakAvoidance`) is Evade-only, while Ignore Invincible (`pierceInvincible`) is universal (both). This also explains the **consumption priority** already recorded in §5 above (Solemn Defense/Anti-Enforcement Defence > Invincible > Evade, per the GameFAQs thread cited there) — now confirmed correct by the project owner directly. **A further confirmed detail**: removing/dispelling a unit's Invincible buff also removes its Evade buff, if both are present — consistent with the shared `buffEvadeAndInvincible` trait tag already documented in §5 (a "remove Invincible" effect that targets that shared trait, rather than the narrower `buffInvincible`-only tag, would strip both in one action). A third, separate tier also exists: `specialInvincible`/`pierceSpecialInvincible` — a stronger Invincible variant (this is what the project owner refers to as "anti-purge" Invincible), sitting above the base `invincible`/`pierceInvincible` pair in the consumption-priority order. The engine's piercing-resolution logic should check, in priority order: `specialInvincible` (needs `pierceSpecialInvincible`) → `invincible` (needs `pierceInvincible`, which *also* clears a co-present `avoidance`) → `avoidance` (needs either `pierceInvincible` or `breakAvoidance`) — not three independent, order-agnostic pairs.

**`specialInvincible` — first live example found (follow-up pass)**: Artoria Caster / Avalon le Fae's NP "Around Caliburn" (`GET /nice/{region}/servant/{id}`) grants `type: "specialInvincible"`, `buffGroup: 250`, `Turn: 3, Count: 1` (identical across all 5 NP levels), detail text "Ignore invincible-pierce, reduce attack damage to 0" — confirming both the buff type's real-world existence and that the project owner's "anti-purge" identification is correct (it explicitly ignores `pierceInvincible`, requiring the stronger `pierceSpecialInvincible` counter, exactly as documented above). Her skill 3 "Sword of Selection EX" separately grants ordinary `invincible`, `buffGroup: 400` — a different group, so it doesn't collide with the NP's `specialInvincible`. The project owner's recollection that this NP's anti-purge buff "cannot stack" is structurally consistent with `buffGroup: 250` being non-zero, but **doesn't resolve the open buffGroup collision-tie-break question** (§8): the only re-application scenario the data supports is recasting the *same* NP from the *same* source, not two different sources landing the same buffGroup — so this confirms *that* it doesn't stack (expected, already established for any non-zero group), not *how* a collision resolves (replace/reject/refresh), which needs a genuinely cross-source case.

**A genuine cross-source pair, and the buffGroup tie-break question is now resolved**: "Altria Caster" (servant id 704700, collectionNo 386 — Berserker-class despite the name) also grants `type: "specialInvincible"`, **`buffGroup: 250`** on her NP — the exact same group as Avalon le Fae's, but with `Turn: 1, Count: 1` (shorter than Avalon le Fae's `Turn: 3, Count: 1`). The project owner ran the live test this pair enabled: cast Avalon le Fae's NP (Turn 3) first, then cast Altria Caster (Berserker)'s NP (Turn 1, different source) on the same unit while the first was still active. **Result: no change at all** — confirming **reject-new** as the collision rule (full detail and engine implication in §3 above; open item closed in §8).

### 6.4 Evade vs. Invincible NP-gain/star-gain consequence — resolved for both

No primary or community source was found across four research passes (files 01, 04, 05, and a follow-up pass) that states explicitly whether an Evaded or Invincible-blocked hit contributes to NP gauge/crit-star gain. **Resolved by direct in-game observation from the project owner, for both buff types**: an attack blocked by either Invincible or Evade (0 damage dealt in both cases) **still generates NP gauge and crit stars** for the attacker — the hit "lands" for gain-formula purposes in both cases, even though the damage formula's own output is nullified. This settles the question the engine's earlier default-guess (file 09 §7) had gotten only half right: that guess assumed Evade specifically does *not* yield gauge/stars (on the theory that an evaded hit "never connects" at all, unlike Invincible's "connects but deals 0 damage" model) — **that assumption is now confirmed wrong**; both buff types behave identically for gain-formula purposes despite their different conceptual framing (a "dodge" vs. a "no-sell"). **Practical engine consequence**: the `resolveDamageInput`/NP-gain/star-drop resolvers (`src/battle/`) can now treat *both* an Invincible-blocked and an Evaded hit as contributing normally to NP-gain and star-drop formulas — only the damage-formula output itself is gated to 0 by either buff's check, with no special-casing needed downstream in the gain formulas. The configurable-flag-per-buff-type approach previously recommended (file 09 §7) is no longer necessary for this specific question — both cases can be hardcoded as "yields normally."

---

## 7. Duration and consumption models — consolidated

Putting §6's concrete findings together with file 01's structural finding, every buff instance's lifetime is governed by up to **three independent expiry axes**, all of which the engine must check every time the buff would otherwise apply, ending the buff the first time any one of them is exhausted:

1. **`Turn`** — counts down once per the buff holder's own turn-advance event. **Exact trigger confirmed (project owner's direct gameplay knowledge, follow-up pass)**: the decrement happens at the end of the round — after the enemy phase completes, immediately before the player's turn begins again — matching the community-tool convention ("decrements at the start of the holder's turn," equivalent framing) that was previously only convention-sourced. No longer flagged open. `-1` = unlimited on this axis.
2. **`Count`** — decrements once per *qualifying consumption event* (an attack absorbed, for Evade/Invincible/Guts; for other count-based buffs like a 3-time-use ATK-up-until-next-attack, a card played). `-1` = unlimited on this axis.
3. **Dispel** — an external `subState`/`releaseState` function removing the buff outright regardless of its own `Turn`/`Count` state, matched by trait (§5).

Additionally, file 00 §6's "consume-once-but-multi-turn-window" pattern (a buff active for several turns but only *consumes*/applies on the next qualifying action, e.g. a one-shot Overcharge-level-up buff) is modeled the same way: `Turn` gives the outer window, `Count` gives the number of remaining applications (often 1) — this is not a fourth mechanic, it's the same two-axis model with `Count: 1`.

---

## 8. Open items carried forward

- ~~Exact precedence when two *different* buffs sharing a non-zero `buffGroup` are both applied~~ — **resolved by a live in-game test (project owner, this session, §3/§6.3)**: using the `specialInvincible`/`buffGroup: 250` cross-source pair (Avalon le Fae's NP, Turn 3, vs. Altria Caster (Berserker)'s NP, Turn 1), casting the second while the first was active produced **no change whatsoever** — confirming **reject-new**: a new application colliding with an already-active same-non-zero-`buffGroup` instance is discarded outright, leaving the existing instance's `Turn`/`Count` untouched. Engine rule updated in §3 accordingly; no longer a placeholder assumption.
- AND vs. OR semantics when a buff's `ckSelfIndv`/`ckOpIndv` lists more than one trait — still **open** after a second pass. The OpenAPI schema's own parameter docs for `ckSelfIndv`/`ckOpIndv` give no AND/OR statement, and a live `/nice/{region}/buff/search?ckOpIndv=X&ckOpIndv=Y` query (tried this session) returns zero matches for the trait pairs tried, so no real multi-trait example was found to reverse-engineer from either. Deferred, low priority — most conditional buffs seen in this project's research use a single trait gate.
- Exact distinction between `subState` and `releaseState` funcTypes — still **open**, per the project owner's call: zero live usages of `releaseState` (confirmed by direct API query, both NA and JP, this session) means there's simply no case to learn the distinction from, not that the question is answered. Non-blocking for the engine today (only `subState`'s dispel-by-trait behavior has any live instances to implement against), but the semantic difference itself remains genuinely unknown — revisit if a future game update ever puts a skill/NP on `releaseState`.
- ~~The "Sure Hit"/certain-hit mechanism~~ — **resolved by a follow-up pass (§6.3)**: it's `breakAvoidance`, a dedicated buff type, narrower in scope than `pierceInvincible` (Evade-only vs. both Evade+Invincible), confirmed against the project owner's direct gameplay experience.
- ~~Evade vs. Invincible's effect on NP gauge/crit-star gain~~ — **fully resolved (§6.4)**: confirmed via direct in-game observation that both Evaded and Invincible-blocked hits still generate NP gauge/stars normally for the attacker.
- `BuffScript.NotPierceIndividuality` — schema-confirmed but no live example matched this session.

---

## 9. Sources

- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/buff.md (buff-action value-resolution formula)
- https://atlasacademy.github.io/fgo-docs/#unstackable-buffs (buff-group stacking rule + cited examples)
- https://atlasacademy.github.io/fgo-docs/#lower-and-upper-bounds-of-buffs (per-action default/floor/ceiling table)
- https://api.atlasacademy.io/docs (OpenAPI schema — `NiceBuff`, `BuffScript`, `Vals`, `NiceBuffType`, `NiceFuncType`, `NiceFuncTargetType` field/enum definitions)
- Live API pulls this session: `GET /nice/JP/equip/197` (Heracles bond CE, Guts), `GET /nice/NA/servant/17` (Cú Chulainn, Evade), `GET /nice/NA/servant/59` (Nero Bride, NP Invincible), `GET /nice/NA/servant/419` (Dobrynya Nikitich, trait-gated ATK-up buff)
- `NiceBuffType` enum (live pull, follow-up pass) — confirms `breakAvoidance`, `pierceInvincible`, `specialInvincible`, `pierceSpecialInvincible` as four distinct values, §6.3
- `GET /nice/{region}/servant/{Artoria Caster's id}` (live pull, follow-up pass — project owner's "Castoria" anti-purge recollection) — first live `specialInvincible` example: NP "Around Caliburn," `buffGroup: 250`, `Turn: 3, Count: 1`; skill 3 "Sword of Selection EX" grants ordinary `invincible`, `buffGroup: 400`, §6.3
- `GET /nice/{region}/servant/704700` (live pull, follow-up pass — "Altria Caster," Berserker-class, collectionNo 386) — second `specialInvincible` source sharing `buffGroup: 250` with Avalon le Fae's, `Turn: 1, Count: 1`; identifies a genuine cross-source pair for the buffGroup tie-break test, §6.3
- Project owner's direct in-game test (session finding, not a written source) — cast Avalon le Fae's NP (specialInvincible, buffGroup 250, Turn 3), then Altria Caster (Berserker)'s NP (specialInvincible, buffGroup 250, Turn 1) on the same unit while the first was still active: no change at all, confirming reject-new as the buffGroup collision tie-break rule, §3/§6.3/§8
- https://fgo.gamepress.gg/q-a/whats-difference-between-evade-and-invincibility (community Q&A — Sure Hit pierces Evade only, Pierce Invincible pierces both; confirmed correct by the project owner's direct gameplay experience, §6.3)
- https://gamefaqs.gamespot.com/boards/180151-fate-grand-order/80084542 (community thread — Solemn Defense > Invincible > Evade consumption priority; confirmed correct by the project owner, §5/§6.3)
- Project owner's direct gameplay knowledge (session correction, not a written source) — Ignore Invincible pierces both Invincible and Evade; removing Invincible also removes a co-present Evade; the Anti-Enforcement Defence > Invincible > Evade priority order is correct, §6.3
- Project owner's direct in-game observation (session finding, not a written source) — both an Invincible-blocked hit and an Evaded hit still generate NP gauge and crit stars for the attacker, §6.4
- `https://api.atlasacademy.io/nice/NA/function/search?type=releaseState`, `https://api.atlasacademy.io/nice/JP/function/search?type=releaseState`, `https://api.atlasacademy.io/raw/JP/function/search?type=releaseState` (live pulls, follow-up pass — all return `[]`, confirming `releaseState` has zero live usages in current game data, §5)
- `https://api.atlasacademy.io/openapi.json` (live pull, follow-up pass — checked for `ckOpIndv`/`ckSelfIndv` AND/OR semantics and `subState`/`releaseState` description text; neither is documented beyond the bare enum/parameter names)
- Project owner's recollection, unconfirmed (session note, not a verified test) — Stun applied onto an already-Petrified target (Gorgon's Petrify vs. Plugsuit's Stun, both `buffGroup` 500) appeared to have no effect, tentatively suggesting reject-new over replace for the buffGroup collision open item; a Stun-from-servant-skill vs. Stun-from-Mystic-Code live test was proposed but not yet run, §3
- Project owner's directive (session note) — ship the engine with a provisional AND default for multi-trait `ckSelfIndv`/`ckOpIndv` gates pending a real counterexample, §4
- Project owner's direct gameplay knowledge (session finding, not a written source) — `Turn` decrements at the end of the round, after the enemy phase and before the player's next turn, confirming the previously convention-only assumption, §7
