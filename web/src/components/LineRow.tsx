import type { QuestOptimizerCandidate } from "fgo-damage-calculator/optimizer";
import { ServantPortrait } from "./ServantPortrait";
import { faceIconUrl } from "../data/liveRoster";
import { formatDamage } from "../data/format";
import { TurnBreakdownPanel } from "./TurnBreakdownPanel";

interface LineRowProps {
  readonly candidate: QuestOptimizerCandidate;
  readonly rank: number;
}

/** One candidate line, collapsed: portraits + turn estimate + headline damage. Expands (native `<details>`) into the full per-turn breakdown. */
export function LineRow({ candidate, rank }: LineRowProps) {
  const frontLine = candidate.party.filter((member) => member.isFrontLine);
  const finalEnemy = candidate.best.finalState.enemies[0];
  const startEnemy = candidate.initialState.enemies[0];
  const totalDamage = startEnemy === undefined || finalEnemy === undefined ? 0 : startEnemy.currentHp - finalEnemy.currentHp;
  const cleared = finalEnemy !== undefined && finalEnemy.currentHp <= 0;

  return (
    <details className="group rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] open:shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-3 p-3 sm:gap-4 sm:p-4">
        <span className="num shrink-0 text-sm font-semibold text-[var(--ink-dim)]">#{rank}</span>

        <div className="flex shrink-0 -space-x-2">
          {frontLine.map((member) => (
            <ServantPortrait key={member.build.servantId} src={faceIconUrl(member.niceServant)} alt={member.niceServant.name} size={44} />
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--ink)]">{frontLine.map((member) => member.niceServant.name).join(" · ")}</p>
          <p className="num text-xs text-[var(--ink-dim)]">
            {formatDamage(totalDamage)} dmg{cleared ? " · cleared" : ""}
          </p>
        </div>

        <svg viewBox="0 0 20 20" className="size-4 shrink-0 text-[var(--ink-dim)] transition-transform group-open:rotate-180" fill="none" aria-hidden="true">
          <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <TurnBreakdownPanel candidate={candidate} />
    </details>
  );
}
