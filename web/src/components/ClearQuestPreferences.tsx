import type { ManualQuestDraft } from "fgo-damage-calculator/quest";
import type { ClearQuestPreferences as Preferences } from "../data/clearQuestRun";
import { plural } from "./compositionPresentation";


export interface PreferredAttackerOption {
  readonly servantId: number;
  readonly name: string;
}

const TURN_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

/** Find composition setup: which quest, which collection, turn limit and ranking preferences. */
export default function ClearQuestPreferences({
  drafts,
  selectedDraftId,
  onSelectDraft,
  collection,
  onOpenServants,
  maxTurns,
  onMaxTurnsChange,
  attackers,
  supportOptions,
  preferences,
  status,
  message,
  onChange,
  onRun,
}: {
  readonly drafts: readonly ManualQuestDraft[];
  readonly selectedDraftId: string;
  readonly onSelectDraft: (id: string) => void;
  readonly collection: { readonly servants: number; readonly craftEssences: number } | null;
  readonly onOpenServants: () => void;
  readonly maxTurns: number;
  readonly onMaxTurnsChange: (turns: number) => void;
  readonly attackers: readonly PreferredAttackerOption[];
  /** Every servant in the region's catalog, for the support picker. */
  readonly supportOptions: readonly PreferredAttackerOption[];
  readonly preferences: Preferences;
  readonly status: "idle" | "running";
  readonly message: string | null;
  readonly onChange: (preferences: Preferences) => void;
  readonly onRun: () => void;
}) {
  const selected = drafts.find((draft) => draft.id === selectedDraftId);
  const supportIds = preferences.supportServantIds ?? [];
  const supports = supportIds.map((servantId) => supportOptions.find((option) => option.servantId === servantId) ?? { servantId, name: `Servant ${servantId}` });
  return (
    <aside aria-labelledby="setup-title" className="side-panel setup-panel">
      <h2 id="setup-title" className="sr-only">Composition setup</h2>

      <section className="panel-section">
        <h3>Quest</h3>
        <label className="field-label">Quest
          <select className="field-input" value={selectedDraftId} onChange={(event) => onSelectDraft(event.target.value)}>
            {drafts.map((draft) => <option key={draft.id} value={draft.id}>{draft.name}</option>)}
          </select>
        </label>
        {selected && <p className="hint">{selected.waves.length} wave{selected.waves.length === 1 ? "" : "s"} · {plural(selected.waves.reduce((sum, wave) => sum + wave.enemies.length, 0), "enemy", "enemies")}</p>}
      </section>

      <section className="panel-section">
        <h3>Party sources</h3>
        <div className="kv-row"><span>Your collection</span><span className="hint">{collection === null ? "Loading…" : `${collection.servants} servants · ${collection.craftEssences} CEs`}</span></div>
        <button className="text-action" type="button" onClick={onOpenServants}>Edit in Servants</button>
      </section>

      <section className="panel-section">
        <h3 id="turn-limit-label">Turn limit</h3>
        <div className="segmented" role="radiogroup" aria-labelledby="turn-limit-label">
          {TURN_OPTIONS.map((turns) => <button key={turns} type="button" role="radio" aria-checked={maxTurns === turns} className={maxTurns === turns ? "is-active" : ""} onClick={() => onMaxTurnsChange(turns)}>{turns}</button>)}
        </div>
        <p className="hint">Searches from 1 turn up to {maxTurns} and stops at the first clear. Pick 3 for 3T farming.</p>
      </section>

      <section className="panel-section">
        <h3>Preferences</h3>
        <label className="field-label">Preferred attacker
          <select className="field-input" value={preferences.preferredAttackerId ?? ""} onChange={(event) => {
            if (event.target.value === "") {
              const { preferredAttackerId: _preferredAttackerId, ...withoutPreference } = preferences;
              onChange(withoutPreference);
              return;
            }
            onChange({ ...preferences, preferredAttackerId: Number(event.target.value) });
          }}>
            <option value="">Let the optimizer decide</option>
            {attackers.map((attacker) => <option key={attacker.servantId} value={attacker.servantId}>{attacker.name}</option>)}
          </select>
        </label>
        <p className="hint">If chosen, this servant must be the main damage dealer.</p>
        <label className="check-row">
          <input type="checkbox" checked={preferences.minimizeCost} onChange={(event) => onChange({ ...preferences, minimizeCost: event.target.checked })} />
          <span>Prefer lower party cost<small className="hint">Ranked after clearing and turn count.</small></span>
        </label>
      </section>

      <section className="panel-section">
        <h3>Borrowed support</h3>
        <p className="hint">The search may borrow one of these: max level without Grails, NP1, skills 10/10/10, Fou +1000, no Craft Essence. A support doesn't count toward Cost.</p>
        {supports.length === 0
          ? <p className="hint">No support. Parties use only your own servants.</p>
          : <ul className="support-list">
              {supports.map((support) => (
                <li key={support.servantId} className="kv-row">
                  <span>{support.name}</span>
                  <button className="text-action" type="button" aria-label={`Remove ${support.name}`} onClick={() => onChange({ ...preferences, supportServantIds: supportIds.filter((id) => id !== support.servantId) })}>Remove</button>
                </li>
              ))}
            </ul>}
        <label className="field-label">Add a support
          <select className="field-input" value="" onChange={(event) => {
            if (event.target.value !== "") onChange({ ...preferences, supportServantIds: [...supportIds, Number(event.target.value)] });
          }}>
            <option value="">Choose a servant…</option>
            {supportOptions.filter((option) => !supportIds.includes(option.servantId)).map((option) => <option key={option.servantId} value={option.servantId}>{option.name}</option>)}
          </select>
        </label>
        <p className="hint">Servants with more than one NP form, such as Space Ishtar, can't be borrowed yet.</p>
        {supports.length > 1 && <p className="hint">Each support adds another full search, so more supports take longer.</p>}
      </section>

      <p className="hint scope-note">Not included yet: Mystic Code skills, Order Change and reliability runs.</p>
      {message && <p role="status" className="field-error">{message}</p>}

      <button className="primary-action primary-action--block" type="button" disabled={status === "running"} onClick={onRun}>
        {status === "running" ? "Searching…" : "Find compositions"}
      </button>
    </aside>
  );
}
