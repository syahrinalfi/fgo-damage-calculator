# Roster Editor Milestone Plan

## Objective

Deliver the second input stage of the Clear Quest flow: a region-separated, locally persisted roster editor backed by Atlas Academy catalog data. This milestone stops before optimizer preferences and result execution.

The editor will cover the account data that the current optimizer consumes directly:

- Master level.
- Owned servants and their actual level, ascension, skill levels, append-skill levels, NP level, Fou values, bond level, selected NP form, and cleared strengthening keys.
- Owned Craft Essence copies, each with its own level and limit-break count.
- Owned Mystic Codes and their levels.

Command Code inventory/equipment and reusable borrowed-support presets remain out of this milestone. Their domain types and persistence remain untouched; the editor must preserve any pre-existing values when saving.

## Confirmed Constraints

- JP and NA are independent accounts. Switching region must load only that region's roster and catalog.
- Atlas static exports are the source of servant, CE, and Mystic Code names/metadata; no character-name whitelist or fictional fixtures.
- A servant appears at most once. Re-adding it opens/updates the existing build instead of creating a duplicate.
- CE ownership is per copy; two copies of the same CE remain two inventory rows.
- Numeric values are validated before persistence. Invalid drafts stay editable but cannot be saved.
- Existing quest drafts and any unsupported roster fields must survive roster edits unchanged.
- Styling follows the current calm technical workspace provisionally; this is functional delivery, not final visual approval.
- Implementation follows RED -> GREEN TDD checkpoints. No production-code edit begins until the relevant new tests fail for the intended reason.

## User Journeys

1. As a player with separate JP and NA accounts, I can switch region and see/edit only that region's roster.
2. As a player, I can search the live Atlas servant catalog, add an owned servant, enter my actual investment, save it, reload the page, and recover the same values.
3. As a player, I can edit or remove an owned servant without creating duplicate entries.
4. As a player, I can add multiple owned copies of the same CE and record each copy's level and limit-break count independently.
5. As a player, I can record Master level and owned Mystic Code levels.
6. As a player, I receive field-specific validation and cannot persist impossible values.
7. As a keyboard/mobile user, I can search, add, edit, save, and remove roster entries at 375 px and desktop widths with labeled controls and visible status feedback.

## Acceptance Rules and Edge Cases

### Account

- Master level is an integer from 1 through 190.
- Loading failure is shown without replacing the other region's in-memory state.
- Region changes discard only unsaved UI draft state; persisted data remains region-specific.

### Servants

- Catalog includes playable Atlas records only: `type` is `normal` or `heroine`.
- Search matches case-insensitive servant name or numeric collection number.
- A newly added servant defaults to Atlas `lvMax`, Ascension 4, skills 1/1/1, no append skills, NP1, Fou 0/0, Bond 0, no CE/Command Codes, and no strengthenings.
- Level is an integer from 1 through 120.
- Ascension is 0 through 4; skill and enabled append-skill levels are 1 through 10; NP is 1 through 5; Fou ATK/HP are integers from 0 through 2000; Bond is an integer from 0 through 15.
- Append slots are optional. An unchecked slot is absent from `appendSkillLevels`, not stored as zero.
- NP selection lists the servant's Atlas NP records. If exactly one usable NP exists it is selected automatically. Multiple forms require an explicit selection before save.
- Strengthening inputs use Atlas `questId:phase` keys exposed by the servant record. The UI does not accept arbitrary free-text keys.
- Removing a servant does not remove CE inventory copies.

### Craft Essences

- Search matches case-insensitive CE name or numeric collection number.
- Every add action creates a distinct owned-copy id, including repeated adds of the same Atlas CE.
- Limit-break count is 0 through 4.
- CE level is an integer from 1 through the selected limit-break stage's Atlas level cap; MLB falls back to `lvMax` when needed.
- Removing a CE copy clears any servant reference to that copy by using the existing account invariant.

### Mystic Codes

- A Mystic Code appears at most once.
- Level is an integer from 1 through 10.

## Planned Files and Changes

### Root domain and tests

- `src/account/rosterEditor.test.ts` (new, RED first)
  - Test immutable updates and preservation of untouched profile fields.
  - Test servant defaults, duplicate replacement, validation boundaries, optional append slots, NP-selection requirement, CE-copy identity/caps, CE-removal cascade, Mystic Code uniqueness, and region mismatch rejection.
- `src/account/rosterEditor.ts` (new, GREEN)
  - Add immutable editor operations and validation result types used by React.
  - Accept small catalog metadata inputs (`servantId`, level cap, NP ids, strengthening keys; CE id/stage caps) rather than importing browser APIs.
  - Reuse existing account invariants for CE removal while cloning before mutation.
- `src/account/index.ts`
  - Export the new editor operations/types through `fgo-damage-calculator/account`.

### Browser data and UI

- `web/src/data/rosterCatalog.ts` (new)
  - Load region-scoped servants, CEs, and Mystic Codes through `getExportClient(region)`.
  - Filter playable servants, normalize lightweight searchable catalog records, derive NP/strengthening choices, and derive CE stage caps.
  - Keep raw Atlas records out of React component state where the normalized fields suffice.
- `web/src/components/RosterEditor.tsx` (new)
  - Render account summary, servant search/list/editor, CE copy search/list/editor, Mystic Code selector/list, validation messages, and save/remove actions.
  - Use semantic labels, fieldsets, buttons, status regions, and responsive single-column/two-column layouts.
- `web/src/App.tsx`
  - Add explicit `Quest` and `Roster` input-stage navigation while keeping Preferences and Results disabled.
  - Load the current region's roster and catalog, pass them into `RosterEditor`, persist valid changes via `JsonRosterRepository`, and display loading/error/saved states.
  - Keep the current quest editor behavior and saved-node rail intact.
  - On region change, reload both quest drafts and the roster independently.

### Documentation and evidence

- `PRODUCT.md`
  - Mark the roster stage implemented and leave preferences/results as the next incomplete stages.
- `.claude/tdd/roster-editor.tdd.md` (new after GREEN)
  - Record plan-to-test mapping, actual RED/GREEN commands/outcomes, browser checks, coverage availability, and known gaps.

No dependency or schema-version change is planned. The current `RosterProfile` JSON envelope already contains every field in this milestone.

## TDD and Verification Sequence

1. Baseline: run `pnpm test`, `pnpm run typecheck`, `pnpm run build`, `pnpm --dir web run lint`, and `pnpm --dir web run build`.
2. RED: add `src/account/rosterEditor.test.ts`; run its focused Vitest target and confirm failures are caused by the missing editor behavior. Commit the RED checkpoint.
3. GREEN domain: implement `rosterEditor.ts` and exports; rerun the focused test until green. Commit the domain GREEN checkpoint.
4. GREEN UI: add catalog adapter and React roster surface; run root typecheck/build plus web lint/build. Commit the UI checkpoint.
5. Regression: run the full deterministic root suite and all builds/lints. Run coverage if the repository exposes a working coverage command; otherwise record the absence rather than claiming a percentage.
6. Browser QA: verify add/edit/save/reload/remove, duplicate servant handling, two CE copies, invalid-value blocking, JP/NA isolation, keyboard labels/status, and layouts at 375 px and 1440 px. No live optimizer run is part of this milestone.
7. Write the TDD evidence report, update `PRODUCT.md`, run `git diff --check`, and review the final diff/status.

## Delivery Boundary

This milestone is complete when a user can persist a validated roster for either region and recover it after reload. Preferences, candidate-search execution, results, Upgrade Advisor presentation, Max Burst, Manual/Sandbox, Command Code editing, and support-preset editing remain follow-up milestones.
