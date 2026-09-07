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
   - Gorgon's Petrify and Plugsuit's Stun both use `buffGroup` 500 → **can't coexist** (whichever lands, or is reapplied, replaces the other).
   - Heracles' bond-CE Guts is `buffGroup` 600 and his post-strengthening 3rd-skill Guts is `buffGroup` 601 → **different groups, so they stack** (both revive counts persist independently).
   - Cú Chulainn's 2nd-skill Evade and the CE *Under the Sun*'s Evade both use buff 151 (`buffGroup` 200) → **can't stack** (this was verified live this session — see §6.1).
   - Most "Buster Up" buffs share `buffGroup` 0 → **`buffGroup` 0 means "no restriction," always stackable** with anything, including copies of itself.

   **Engine rule**: when applying a new buff, check whether the target already carries a buff with the same non-zero `buffGroup`; if so, the new application does not add a second independent instance (the exact replace-vs-reject-vs-refresh precedence when two *different* buffs of the same group land isn't spelled out in the primary doc — flagged as **open**, deferred to file 08/09 if it becomes load-bearing for a specific interaction).

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

This is the exact mechanism file 00 §4 flagged (the Koyanskaya-of-Light-style "unconditional + trait-gated" pattern): the buff's **`ckOpIndv`** field lists the trait(s) the *target of the buff's action* must carry for that buff's contribution to count. `ckSelfIndv` is the mirror-image check on the **buff holder** instead (e.g. a passive that only applies "if self is Female"). Both are lists of `NiceTrait`, so multi-trait AND-style gates are structurally supported (needs a live multi-trait example to confirm AND vs. OR semantics — not found this session, flagged **open**).

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
| `releaseState` | A second, structurally separate removal type (exact distinction from `subState` not pinned down by a live example this session — flagged **open**) |
| `addStateFuncType169` / `addStateFuncType170` | Unnamed/placeholder-named `addState` variants (Atlas Academy hasn't assigned semantic names yet) |

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

**New finding, not previously in this project's docs**: Invincible's own detail text says it also **"Ignore[s] Sure Hit"** — i.e., Invincible additionally blocks a category of "guaranteed hit" effects that (by implication) *can* bypass a plain Evade. No dedicated `NiceBuffType` named "Sure Hit"/"certain hit" was found in the 239-value enum this session, so the exact mechanism (is it a `BuffScript` flag on the attacking function? a `NiceTrait`?) is **unresolved** — flagged open, deferred to file 06 (traits) or 08 (enemy mechanics) since "certain hit" style effects are more commonly enemy-side (e.g. anti-Evade boss kit) than player-side.

### 6.4 Evade vs. Invincible NP-gain/star-gain consequence — still open

Despite the three concrete examples above nailing down duration mechanics precisely, **no primary source was found this session** (searched `buff.md`, the full rendered doc site table of contents, and the `np.md`/`critstars.md` formulas themselves) that states explicitly whether an Evaded hit or an Invincible-blocked hit contributes to NP gauge/crit-star gain. The `np.md`/`critstars.md` formulas (file 04 §1–2, §6) describe gain **per landed hit** but don't define what "landed" means for a hit that dealt 0 damage via Evade/Invincible — this remains a genuine gap after three research passes (files 01, 04, 05) specifically looking for it. **Deferred to file 08** (enemy mechanics), on the theory that this is most concretely testable/documented in the context of specific boss Evade/Invincible-gimmick fights rather than the general buff docs.

---

## 7. Duration and consumption models — consolidated

Putting §6's concrete findings together with file 01's structural finding, every buff instance's lifetime is governed by up to **three independent expiry axes**, all of which the engine must check every time the buff would otherwise apply, ending the buff the first time any one of them is exhausted:

1. **`Turn`** — counts down once per the buff holder's own turn-advance event (exact trigger — start of holder's turn vs. end — not pinned down this session; the existing convention across FGO community tools is "decrements at the start of the holder's turn," consistent with, but not itself sourced from, a primary doc found this session — flagged **open, community-convention-only**). `-1` = unlimited on this axis.
2. **`Count`** — decrements once per *qualifying consumption event* (an attack absorbed, for Evade/Invincible/Guts; for other count-based buffs like a 3-time-use ATK-up-until-next-attack, a card played). `-1` = unlimited on this axis.
3. **Dispel** — an external `subState`/`releaseState` function removing the buff outright regardless of its own `Turn`/`Count` state, matched by trait (§5).

Additionally, file 00 §6's "consume-once-but-multi-turn-window" pattern (a buff active for several turns but only *consumes*/applies on the next qualifying action, e.g. a one-shot Overcharge-level-up buff) is modeled the same way: `Turn` gives the outer window, `Count` gives the number of remaining applications (often 1) — this is not a fourth mechanic, it's the same two-axis model with `Count: 1`.

---

## 8. Open items carried forward

- Exact precedence when two *different* buffs sharing a non-zero `buffGroup` are both applied (replace-oldest vs. reject-new vs. refresh-duration) — no primary source found; deferred to file 08/09 if a specific interaction makes it load-bearing.
- AND vs. OR semantics when a buff's `ckSelfIndv`/`ckOpIndv` lists more than one trait — no multi-trait live example found this session.
- Exact distinction between `subState` and `releaseState` funcTypes (both are buff-removal, naming alone doesn't establish the difference) — deferred to file 06/08.
- The "Sure Hit"/certain-hit mechanism that Invincible explicitly ignores (per its own detail text) but Evade apparently does not — no matching `NiceBuffType`/`BuffScript` field identified this session; deferred to file 06 (traits) or 08 (enemy mechanics).
- **Evade vs. Invincible's effect on NP gauge/crit-star gain** — still unresolved after three research passes (files 01, 04, 05); deferred to file 08.
- `BuffScript.NotPierceIndividuality` — schema-confirmed but no live example matched this session.

---

## 9. Sources

- https://github.com/atlasacademy/fgo-docs/blob/master/deeper/battle/buff.md (buff-action value-resolution formula)
- https://atlasacademy.github.io/fgo-docs/#unstackable-buffs (buff-group stacking rule + cited examples)
- https://atlasacademy.github.io/fgo-docs/#lower-and-upper-bounds-of-buffs (per-action default/floor/ceiling table)
- https://api.atlasacademy.io/docs (OpenAPI schema — `NiceBuff`, `BuffScript`, `Vals`, `NiceBuffType`, `NiceFuncType`, `NiceFuncTargetType` field/enum definitions)
- Live API pulls this session: `GET /nice/JP/equip/197` (Heracles bond CE, Guts), `GET /nice/NA/servant/17` (Cú Chulainn, Evade), `GET /nice/NA/servant/59` (Nero Bride, NP Invincible), `GET /nice/NA/servant/419` (Dobrynya Nikitich, trait-gated ATK-up buff)
