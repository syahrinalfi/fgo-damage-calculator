# Repository Guidelines

## Project Structure & Module Organization

The root package is the TypeScript simulation and optimizer engine. Code under `src/` is organized by responsibility: `engine/` contains pure formulas, `battle/` owns stateful turn resolution, `buffs/` evaluates modifiers, `quest/` models waves and enemies, `optimizer/` searches party/action candidates, `account/` stores roster shapes, and `data/` wraps Atlas Academy APIs. Tests are colocated as `*.test.ts`; network smoke tests use `*.live.test.ts`. Research-backed mechanics live in `research/`. The React/Vite client is in `web/`, with components, hooks, and data adapters under `web/src/` and static assets under `web/public/`.

Read `PRODUCT.md` before changing product behavior. The current web UI and `DESIGN.md` are deprecated prototypes, not a visual baseline.

## Build, Test, and Development Commands

- `pnpm install` — install all workspace dependencies.
- `pnpm run typecheck` — strict root TypeScript validation without emitting files.
- `pnpm test` — deterministic Vitest suite; excludes network tests.
- `pnpm run test:live` — call the real Atlas Academy API; run deliberately, never as a routine loop.
- `pnpm run build` — compile the root package to `dist/`.
- `pnpm --dir web run dev` — start the Vite development server.
- `pnpm --dir web run lint` — run Oxlint on the client.
- `pnpm --dir web run build` — typecheck and bundle the client. Build the root first because `web` imports its workspace exports.

## Coding Style & Naming Conventions

Use two-space indentation, strict TypeScript, immutable/`readonly` state, and pure transformations where practical. Use `camelCase` for functions and variables, `PascalCase` for types/components, and descriptive domain names such as `resolveAction` or `buildInitialBattleState`. Root code uses native ESM; relative imports must include `.js` extensions. Comments should explain research-backed rationale or surprising invariants, not restate the code.

## Testing Guidelines

Use Vitest and colocate tests with their modules. Add mocked fast tests for every behavior change. API shape or endpoint changes also require a matching `*.live.test.ts`. Before handoff, run typecheck, fast tests, and a clean root build; for client work, also run web lint and build.

## Commit & Pull Request Guidelines

History uses concise imperative subjects such as `Add multi-turn search horizon` and `Wire the 3 auto-resolvers`. Keep commits narrowly scoped. Pull requests should explain behavior and product impact, list verification commands, link relevant research or issues, and include screenshots for UI changes. Call out live-network assumptions, deferred mechanics, and unrelated existing worktree changes explicitly.
