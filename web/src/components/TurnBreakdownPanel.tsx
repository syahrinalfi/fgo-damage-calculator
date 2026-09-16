import type { QuestOptimizerCandidate } from "fgo-damage-calculator/optimizer";
import { computeTurnBreakdown } from "../data/turnBreakdown";
import { CARD_LABEL, CARD_TONE, formatDamage, formatPercent } from "../data/format";
import { ServantPortrait } from "./ServantPortrait";
import { faceIconUrl } from "../data/liveRoster";

const TONE_BG: Record<"arts" | "buster" | "quick", string> = {
  arts: "bg-[var(--arts-dim)] text-[var(--arts)]",
  buster: "bg-[var(--buster-dim)] text-[var(--buster)]",
  quick: "bg-[var(--quick-dim)] text-[var(--quick)]",
};

interface TurnBreakdownPanelProps {
  readonly candidate: QuestOptimizerCandidate;
}

export function TurnBreakdownPanel({ candidate }: TurnBreakdownPanelProps) {
  const breakdown = computeTurnBreakdown(candidate.initialState, candidate.best.actions);
  const servantById = new Map(candidate.party.map((member) => [member.build.servantId, member]));

  return (
    <div className="space-y-4 border-t border-[var(--rule)] bg-[var(--ground-inset)] p-4 sm:p-5">
      {breakdown.map((turn) => (
        <section key={turn.turnNumber} aria-label={`Turn ${turn.turnNumber}`} className="rounded-md border border-[var(--rule)] bg-[var(--ground-raised)] p-3 sm:p-4">
          <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-semibold text-[var(--ink)]">Turn {turn.turnNumber}</h3>
            <p className="text-xs text-[var(--ink-dim)]">
              Damage this turn: <span className="num font-semibold text-[var(--ink)]">{formatDamage(turn.damageDealt)}</span> · Enemy HP:{" "}
              <span className="num">
                {formatDamage(turn.enemyHpAfter)} / {formatDamage(turn.enemyMaxHp)}
              </span>
            </p>
          </header>

          <div className="space-y-2">
            {turn.servants.map((servantTurn) => {
              const member = servantById.get(servantTurn.servantId);
              if (member === undefined) return null;
              return (
                <div key={servantTurn.servantId} className="flex flex-wrap items-center gap-3 rounded-sm bg-[var(--ground-inset)] p-2">
                  <ServantPortrait src={faceIconUrl(member.niceServant)} alt={member.niceServant.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-[var(--ink)]">{member.niceServant.name}</p>
                    {member.equippedCe !== undefined && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <ServantPortrait src={faceIconUrl(member.equippedCe.data)} alt={member.equippedCe.data.name} size={16} />
                        <span className="truncate text-xs text-[var(--ink-dim)]">{member.equippedCe.data.name}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    {servantTurn.events.length === 0 ? (
                      <span className="text-xs text-[var(--ink-dim)]">no action</span>
                    ) : (
                      servantTurn.events.map((event, i) =>
                        event.kind === "card" ? (
                          event.cardType === undefined ? (
                            <span key={i} className="num rounded-sm bg-[var(--ground-raised)] px-1.5 py-0.5 text-xs text-[var(--ink-dim)] ring-1 ring-[var(--rule)]">
                              Card
                            </span>
                          ) : (
                            <span key={i} className={`num rounded-sm px-1.5 py-0.5 text-xs font-semibold ${TONE_BG[CARD_TONE[event.cardType]]}`}>
                              {CARD_LABEL[event.cardType]}
                            </span>
                          )
                        ) : event.kind === "np" ? (
                          <span key={i} className="num rounded-sm bg-[var(--ground-raised)] px-1.5 py-0.5 text-xs font-semibold text-[var(--amber)] ring-1 ring-[var(--amber)]">
                            NP
                          </span>
                        ) : (
                          <span key={i} className="num rounded-sm bg-[var(--ground-raised)] px-1.5 py-0.5 text-xs text-[var(--ink-dim)] ring-1 ring-[var(--rule)]">
                            Skill {event.skillSlot}
                          </span>
                        ),
                      )
                    )}
                  </div>
                  <span className="num ml-auto text-xs text-[var(--ink-dim)]">
                    NP {formatPercent(servantTurn.npGaugePercent)} <span className="text-[var(--ink)]">({servantTurn.npGainedPercent >= 0 ? "+" : ""}{formatPercent(servantTurn.npGainedPercent)})</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
