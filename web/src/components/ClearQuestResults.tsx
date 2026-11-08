import { partyMemberBattleId, selectNoblePhantasmVersion, type QuestOptimizerCandidate, type UpgradeAdvisorReport } from "fgo-damage-calculator/optimizer";
import type { ClearQuestRunResult } from "../data/clearQuestRun";
import { faceIconUrl } from "../data/liveRoster";
import { groupActionsByTurn } from "./compositionPresentation";
import { ServantPortrait } from "./ServantPortrait";

type CandidateAction = QuestOptimizerCandidate["best"]["actions"][number];

type PartyMember = QuestOptimizerCandidate["party"][number];

function memberName(member: PartyMember): string {
  return member.isSupport === true ? `${member.niceServant.name} (support)` : member.niceServant.name;
}

function servantName(candidate: QuestOptimizerCandidate, servantId: number): string {
  const member = candidate.party.find((entry) => partyMemberBattleId(entry) === servantId);
  return member === undefined ? "Unknown Servant" : memberName(member);
}

function actionLabel(candidate: QuestOptimizerCandidate, action: CandidateAction): string {
  if (action.type === "playCard") return `${servantName(candidate, action.servantId)} card · slot ${action.chainPosition}`;
  if (action.type === "castNp") {
    const member = candidate.party.find((entry) => partyMemberBattleId(entry) === action.servantId);
    const noblePhantasm = member === undefined ? undefined : selectNoblePhantasmVersion(member.niceServant.noblePhantasms ?? [], member.build);
    return `NP · ${servantName(candidate, action.servantId)} (${noblePhantasm?.name ?? "Noble Phantasm"})`;
  }
  if (action.type === "playExtraCard") return `${servantName(candidate, action.servantId)} · Extra Attack`;
  if (action.type === "useSkill") return `${servantName(candidate, action.servantId)} · Skill ${action.skillSlot}`;
  if (action.type === "useMysticCodeSkill") return `Mystic Code · Skill ${action.slot}`;
  if (action.type === "orderChange") return `Order Change · ${servantName(candidate, action.outgoingServantId)} → ${servantName(candidate, action.incomingServantId)}`;
  if (action.type === "useCommandSeal") return `Command Seal · ${action.effect.kind}`;
  return "End turn";
}

function CompositionRow({ candidate, index, turns }: { readonly candidate: QuestOptimizerCandidate; readonly index: number; readonly turns: number | null }) {
  const attackerIds = new Set(candidate.attribution.attackerIds);
  const front = candidate.party.filter((member) => member.isFrontLine);
  const back = candidate.party.filter((member) => !member.isFrontLine);
  const turnActions = groupActionsByTurn(candidate.best.actions);
  const member = (entry: PartyMember) => {
    const battleId = partyMemberBattleId(entry);
    const roles = [attackerIds.has(battleId) ? "Attacker" : null, entry.isSupport === true ? "Support" : null].filter((role) => role !== null).join(" · ");
    return (
      <li key={battleId} className="party-slot">
        <ServantPortrait src={faceIconUrl(entry.niceServant)} alt={memberName(entry)} size={52} />
        <span className={roles === "" ? "role-tag is-empty" : "role-tag"}>{roles === "" ? " " : roles}</span>
      </li>
    );
  };
  return (
    <details className="composition" open={index === 0}>
      <summary>
        <span className="composition__rank">#{index + 1}</span>
        <ul className="party-row" aria-label="Party: front line, then back line">
          {front.map(member)}
          {back.length > 0 && <li className="party-row__divider" aria-hidden="true" />}
          {back.map(member)}
        </ul>
        <dl className="metrics">
          <div><dt>turns</dt><dd className="num">{turns ?? "—"}</dd></div>
          <div><dt>cost</dt><dd className="num">{candidate.initialState.costSpent} / {candidate.initialState.costBudget}</dd></div>
        </dl>
        <span className="composition__chevron" aria-hidden="true">▾</span>
      </summary>
      <div className="turn-grid">
        {turnActions.map((actions, turnIndex) => (
          <section key={turnIndex} className="turn-card" aria-label={`Turn ${turnIndex + 1}`}>
            <h4>Turn {turnIndex + 1}</h4>
            <ol>{actions.map((action, actionIndex) => <li key={actionIndex}>{actionLabel(candidate, action)}</li>)}</ol>
          </section>
        ))}
      </div>
      <p className="hint composition__ces">CEs: {candidate.party.map((entry) => `${entry.niceServant.name} — ${entry.equippedCe?.data.name ?? "none"}`).join(" · ")}</p>
    </details>
  );
}

export default function ClearQuestResults({
  run,
  maxTurns,
  upgrades,
  upgradeStatus,
  upgradeMessage,
  onFindUpgrades,
}: {
  readonly run: ClearQuestRunResult | null;
  readonly maxTurns: number;
  readonly upgrades: UpgradeAdvisorReport | null;
  readonly upgradeStatus: "idle" | "running";
  readonly upgradeMessage: string | null;
  readonly onFindUpgrades: () => void;
}) {
  if (run === null) {
    return (
      <section aria-labelledby="results-title" className="results">
        <h2 id="results-title" className="page-title">Compositions</h2>
        <div className="empty-card"><p>Set the turn limit and preferences, then press <strong>Find compositions</strong>.</p></div>
      </section>
    );
  }

  const { result } = run;
  const count = result.candidates.length;
  const heading = result.minimumTurns === null
    ? `No clear within ${result.searchedThroughTurn} turn${result.searchedThroughTurn === 1 ? "" : "s"}`
    : `${count} composition${count === 1 ? "" : "s"} clear in ${result.minimumTurns} turn${result.minimumTurns === 1 ? "" : "s"}`;

  return (
    <section aria-labelledby="results-title" className="results">
      <header className="results__head">
        <div>
          <h2 id="results-title" className="page-title">{heading}</h2>
          <p className="hint">Searched up to {maxTurns} turns with a party-cost budget of {run.costBudget}. Ranked by turns, then your preferences; compositions differ by party or attacker, not only card order.</p>
        </div>
      </header>

      {result.minimumTurns !== null && count > 0 && <div className="composition-list">{result.candidates.map((candidate, index) => <CompositionRow key={candidate.strategyKey} candidate={candidate} index={index} turns={result.minimumTurns} />)}</div>}
      {result.minimumTurns !== null && count === 0 && <div className="empty-card"><p>No valid party was found from your saved collection.</p></div>}

      {result.minimumTurns === null && (
        <section className="upgrade-panel" aria-labelledby="upgrade-title">
          <h3 id="upgrade-title">Smallest upgrades that would make it clear</h3>
          <p className="hint">Tests upgrades to servants and CEs you already own. Your saved collection is never changed.</p>
          <button className="primary-action" type="button" disabled={upgradeStatus === "running"} onClick={onFindUpgrades}>{upgradeStatus === "running" ? "Testing upgrades…" : "Find upgrades"}</button>
          {upgradeMessage && <p role="status" className="field-error">{upgradeMessage}</p>}
          {upgrades && <>
            <p className="hint">Tested {upgrades.testedScenarioCount} scenarios.</p>
            {upgrades.recommendations.length === 0 ? <div className="empty-card"><p>No modeled upgrade turns this into a clear.</p></div> : <ul className="upgrade-list">
              {upgrades.recommendations.map((recommendation) => (
                <li key={recommendation.id} className="upgrade-card">
                  <strong>{recommendation.label}</strong>
                  <span className="num">{recommendation.steps} step{recommendation.steps === 1 ? "" : "s"} · clears in {recommendation.result.minimumTurns}T</span>
                </li>
              ))}
            </ul>}
          </>}
        </section>
      )}
    </section>
  );
}
