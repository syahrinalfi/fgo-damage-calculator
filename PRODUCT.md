# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

TypeScript end-to-end — data layer, simulation/optimizer engine, and (later) UI as a Vite+React web app. Delegated to Claude by the user; rationale: one language across the whole stack, native fetch/JSON handling for the Atlas Academy API, runs directly in the browser without a separate backend service.

## Users

Two audiences sharing one engine:
- **Newer / low-roster players** stuck on content that feels "too hard" but is often clearable with what they already own, just not built or played optimally. Their question: "can I clear this at all, and how."
- **Experienced players** optimizing tight farming clears for 90++ (Lv.90+) events and Challenge Quests, where margins are tight and exact skill/card ordering matters. Their question: "what's the fastest/most reliable line."

## Product Purpose

A data-driven FGO (Fate/Grand Order) damage & NP calculator that evolves into a **fastest-clear farming optimizer** and a **strongest single-target (ST) burst finder**, backed by real Atlas Academy servant/CE/enemy data and the user's actual (possibly unfinished) account state — not hypothetical max-investment numbers.

The optimizer's target turn count is **not hardcoded to 3** — 3-turn is the common/flagship case (matches the most frequent 3-wave farming node), but the engine searches for whichever turn count is actually achievable given the user's real roster/account condition: it may find a faster clear (fewer turns) when the roster is strong, or report the minimum achievable turn count above the target when it isn't reachable, rather than only succeeding/failing against a fixed M=3.

Success means the user gets an actionable, per-wave/per-hit plan (servants, skills, card order, NP timing, Order Changes) they can execute in-game, or — when nothing clears yet — a concrete "what would need to change" gap analysis.

## Positioning

Simulates actual per-hit/per-card damage and NP-gauge mechanics from real, live-fetched servant/CE/enemy data at the user's *actual* entered account state (real skill/NP/append levels, Fou values, bond, CE MLB status) — not a generic stat-based estimator and not assuming maxed investment. Turn-count target is a search parameter, not a fixed assumption, so the same engine handles a 1-wave daily, a standard farming node, or a 4+ wave Challenge Quest without special-casing wave count.

## Operating Context

- Primary data source: `https://api.atlasacademy.io` (`nice` endpoints), fetched at runtime/build time — never hand-curated servant/CE data, since it would rot on every game patch.
- Region is a user-switchable setting with **fully separate stored account data per region** (JP and NA/EN are independent accounts with independent roster state, not a merged dataset).
- User's roster (servant levels, skill levels, NP level, ascension/append skills, Fou values, bond level, equipped CE + level/MLB, Mystic Code) is entered and stored manually/locally per account — this is private data Atlas Academy doesn't have.
- CE inventory is a list of owned copies (not a boolean "own/don't own" set) — duplicates are common and the optimizer must respect actual copy counts.

## Capabilities and Constraints

Confirmed in scope (see `research/00-project-overview.md` §1 for full detail):
- 3T-style Farm Optimizer with core/free-slot tagging, Total Cost reporting, Minimum-Cost mode, Prefer-Event-CE mode, Prefer-Bond-CE mode, preferred-attacker constraint, Top-5 distinct results, fallback suggestions.
- Strongest ST Burst Finder, including multi-turn setup strategies (not single-turn-only).
- Manual/Sandbox Builder reusing the same simulation core as the optimizers.
- "Not Clearable Yet" Gap Analysis / Build-Up Advisor (smallest concrete upgrade that flips fail→clear).

Explicit non-goals (for now): enemy attack/survivability simulation (data is available, deferred as an explicit phase-2, not a data limitation); gacha/rolling or investment-cost modeling; native/mobile app (web only); hand-curated servant/CE/enemy data.

Open, unsourced mechanics tracked as implementation-time follow-ups (not blockers): card-draw weighting/guarantee rule, star-carryover-to-next-turn cap, Order Change state-transfer rules, evaded/invincible-blocked hit's gauge/star yield. See `research/09-simulation-and-optimizer-design.md` §7.

No git repository exists yet; no code/package.json exists yet — this is the first implementation work after a fully completed research phase (`research/00`–`09`).

## Evidence on Hand

- `research/00-project-overview.md` through `research/09-simulation-and-optimizer-design.md` — ten primary-source-cited research files covering data sources, damage formula, card/hit mechanics, NP gauge/refund, buffs/debuffs, traits/class mechanics, Mystic Codes, enemy mechanics, and the simulation/optimizer design. These are the binding technical spec for implementation.
- No UI mockups, brand assets, or existing visual work exist yet.

## Product Principles

- **Real account state over hypothetical max investment** — every number (skill level, NP level, Fou, bond, CE MLB) reflects what the user actually owns, never assumed maxed.
- **Turn count is a search target, not a hardcoded assumption** — one generalized engine handles any wave/turn count.
- **Community strategies emerge from simulation, not hardcoded patterns** — known lines (Arts loop, Buster loop, etc.) should fall out of simulate+search, used as heuristics to prune the search space, not as the only options.
- **Primary-source data only** — every formula/number traces to Atlas Academy's API/schema or the `fgo-docs` repo; unsourced mechanics are explicitly flagged, never silently assumed.
- **Failure is actionable** — when nothing clears, report the closest line and the smallest concrete upgrade that would make it clear, not just "not possible."
