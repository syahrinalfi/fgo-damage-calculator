import { Region, type SupportedRegion } from "fgo-damage-calculator/data";
import type { RosterProfile } from "fgo-damage-calculator/account";
import {
  addManualEnemy,
  addManualWave,
  createManualQuestDraft,
  removeManualEnemy,
  removeManualWave,
  renameManualQuest,
  updateManualEnemy,
  type ManualEnemyInput,
  type ManualQuestDraft,
} from "fgo-damage-calculator/quest";
import { useEffect, useMemo, useState } from "react";
import ClearQuestPreferences from "./components/ClearQuestPreferences";
import ClearQuestResults from "./components/ClearQuestResults";
import { plural, questReadiness } from "./components/compositionPresentation";
import { createBrowserInputRepositories } from "./data/persistentInputs";
import { DEFAULT_SUPPORT_SERVANT_IDS, findClearQuestUpgrades, runClearQuest, supportPickerOptions, type ClearQuestPreferences as ClearQuestRunPreferences, type ClearQuestRunResult } from "./data/clearQuestRun";
import type { UpgradeAdvisorReport } from "fgo-damage-calculator/optimizer";
import { loadRosterCatalog, type RosterCatalogData } from "./data/rosterCatalog";
import { loadTraitCatalog, type TraitCatalogEntry } from "./data/traitCatalog";
import RosterEditor from "./components/RosterEditor";

const CLASS_OPTIONS = [
  "saber", "archer", "lancer", "rider", "caster", "assassin", "berserker",
  "ruler", "avenger", "alterEgo", "moonCancer", "foreigner", "pretender",
] as const;
const ATTRIBUTE_OPTIONS = ["human", "earth", "sky", "star", "beast"] as const;
const REGION_OPTIONS: readonly SupportedRegion[] = [Region.NA, Region.JP];
const AREAS = [["servants", "Servants"], ["clearOptimizer", "Clear Optimizer"], ["damageCalculator", "Damage Calculator"]] as const;
const DEFAULT_MAX_TURNS = 6;

type Area = (typeof AREAS)[number][0] | "settings";
type Step = "quest" | "compose";

function newDraft(region: SupportedRegion): ManualQuestDraft {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `quest-${Date.now()}`;
  return createManualQuestDraft(region, id);
}

function EnemyEditor({ enemy, waveIndex, enemyIndex, canRemove, traitCatalog, onChange, onRemove }: {
  readonly enemy: ManualEnemyInput;
  readonly waveIndex: number;
  readonly enemyIndex: number;
  readonly canRemove: boolean;
  readonly traitCatalog: readonly TraitCatalogEntry[];
  readonly onChange: (patch: Partial<ManualEnemyInput>) => void;
  readonly onRemove: () => void;
}) {
  const [traitQuery, setTraitQuery] = useState("");
  const selectedTraits = traitCatalog.filter((trait) => enemy.traits?.includes(trait.id));
  const matchingTraits = traitCatalog.filter((trait) => trait.name.toLocaleLowerCase().includes(traitQuery.trim().toLocaleLowerCase())).slice(0, 12);
  const missingHp = !(enemy.hp > 0);
  const toggleTrait = (traitId: number) => {
    const selected = enemy.traits ?? [];
    onChange({ traits: selected.includes(traitId) ? selected.filter((id) => id !== traitId) : [...selected, traitId] });
  };
  return (
    <fieldset className={`enemy-card ${missingHp ? "is-invalid" : ""}`}>
      <legend className="sr-only">Wave {waveIndex + 1}, enemy {enemyIndex + 1}</legend>
      <div className="enemy-card__head">
        <strong>Enemy {enemyIndex + 1}</strong>
        <button className="icon-action" type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Remove enemy ${enemyIndex + 1} from wave ${waveIndex + 1}`}>✕</button>
      </div>
      <div className="enemy-card__fields">
        <label>Class
          <select className="field-input" value={enemy.className} onChange={(event) => onChange({ className: event.target.value as ManualEnemyInput["className"] })}>
            {CLASS_OPTIONS.map((className) => <option key={className} value={className}>{className}</option>)}
          </select>
        </label>
        <label>Attribute
          <select className="field-input" value={enemy.attribute} onChange={(event) => onChange({ attribute: event.target.value as ManualEnemyInput["attribute"] })}>
            {ATTRIBUTE_OPTIONS.map((attribute) => <option key={attribute} value={attribute}>{attribute}</option>)}
          </select>
        </label>
        <label>HP
          <input className="field-input num" type="number" min={1} value={enemy.hp} aria-invalid={missingHp} onChange={(event) => onChange({ hp: Number(event.target.value) })} />
          {missingHp && <small className="field-error">Required</small>}
        </label>
      </div>
      <div className="enemy-card__traits">
        <span className="field-label">Traits</span>
        {selectedTraits.map((trait) => <button key={trait.id} className="chip is-on" type="button" onClick={() => toggleTrait(trait.id)} aria-label={`Remove trait ${trait.name}`}>{trait.name} ×</button>)}
        <input className="chip-input" type="search" value={traitQuery} placeholder="+ Add trait" aria-label={`Search traits for wave ${waveIndex + 1} enemy ${enemyIndex + 1}`} onChange={(event) => setTraitQuery(event.target.value)} />
      </div>
      {traitQuery.trim().length > 0 && <div className="trait-results">
        {matchingTraits.map((trait) => <button key={trait.id} className={`chip ${enemy.traits?.includes(trait.id) ? "is-on" : ""}`} type="button" aria-pressed={enemy.traits?.includes(trait.id) ?? false} onClick={() => toggleTrait(trait.id)}>{trait.name}</button>)}
        {matchingTraits.length === 0 && <p className="hint">No matching traits.</p>}
      </div>}
    </fieldset>
  );
}

function QuestEditor({ draft, traitCatalog, onDraftChange }: { readonly draft: ManualQuestDraft; readonly traitCatalog: readonly TraitCatalogEntry[]; readonly onDraftChange: (draft: ManualQuestDraft) => void }) {
  return (
    <section aria-label="Quest editor" className="quest-editor">
      <div className="quest-editor__head">
        <label className="field-label quest-name">Quest name
          <input className="field-input" value={draft.name} onChange={(event) => onDraftChange(renameManualQuest(draft, event.target.value))} />
        </label>
        <div className="quest-editor__meta">
          <span className="field-label">Waves</span>
          <strong className="num">{draft.waves.length}</strong>
          <span className="field-label">Region</span>
          <strong>{draft.region} account</strong>
        </div>
      </div>
      <p className="hint">Enemy turns aren't simulated; results assume your attacks only.</p>
      <div className="wave-columns">
        {draft.waves.map((wave, waveIndex) => (
          <section key={waveIndex} className="wave-column" aria-label={`Wave ${waveIndex + 1}`}>
            <header>
              <h2>Wave {waveIndex + 1}</h2>
              <span className="hint">{wave.enemies.length} / 3 enemies</span>
              <button className="text-action" type="button" disabled={draft.waves.length === 1} onClick={() => onDraftChange(removeManualWave(draft, waveIndex))}>Remove wave</button>
            </header>
            {wave.enemies.map((enemy, enemyIndex) => (
              <EnemyEditor key={enemyIndex} enemy={enemy} waveIndex={waveIndex} enemyIndex={enemyIndex} canRemove={wave.enemies.length > 1} traitCatalog={traitCatalog} onChange={(patch) => onDraftChange(updateManualEnemy(draft, waveIndex, enemyIndex, patch))} onRemove={() => onDraftChange(removeManualEnemy(draft, waveIndex, enemyIndex))} />
            ))}
            <button className="dashed-action" type="button" disabled={wave.enemies.length >= 3} onClick={() => onDraftChange(addManualEnemy(draft, waveIndex))}>+ Add enemy</button>
          </section>
        ))}
        <button className="dashed-action wave-column--add" type="button" onClick={() => onDraftChange(addManualWave(draft))}>+ Add wave</button>
      </div>
    </section>
  );
}

function StepBar({ step, questName, canCompose, onStepChange }: { readonly step: Step; readonly questName: string; readonly canCompose: boolean; readonly onStepChange: (step: Step) => void }) {
  const steps = [["quest", "Quest"], ["compose", "Find composition"]] as const;
  return (
    <nav className="step-bar" aria-label="Clear Optimizer steps">
      <ol>
        {steps.map(([id, label], index) => {
          const active = id === step;
          const done = step === "compose" && id === "quest";
          return (
            <li key={id}>
              {index > 0 && <span className="step-bar__line" aria-hidden="true" />}
              <button type="button" className={active ? "is-active" : done ? "is-done" : ""} aria-current={active ? "step" : undefined} disabled={id === "compose" && !canCompose} onClick={() => onStepChange(id)}>
                <span className="step-bar__badge">{done ? "✓" : index + 1}</span>{label}
              </button>
            </li>
          );
        })}
      </ol>
      {step === "compose" && <div className="step-bar__context"><span className="hint">{questName}</span><button className="secondary-action" type="button" onClick={() => onStepChange("quest")}>Edit quest</button></div>}
    </nav>
  );
}

function DamageCalculatorPlaceholder() {
  return (
    <section aria-labelledby="damage-calculator-title" className="placeholder-page">
      <h1 id="damage-calculator-title">Damage Calculator</h1>
      <p>Theorycraft a custom team: pick an attacker and its buffs, set a target enemy and a card chain, and see the damage range, NP refund, stars and every formula term.</p>
      <p className="hint">This area is designed and comes next. Clear Optimizer and Servants are ready to use.</p>
    </section>
  );
}

function SettingsPanel({ region, onExport, onClearCache, onClearData }: { readonly region: SupportedRegion; readonly onExport: () => void; readonly onClearCache: () => void; readonly onClearData: () => void }) {
  return <section aria-labelledby="settings-title" className="settings-page"><header><p className="eyebrow">Local account · {region}</p><h1 id="settings-title" className="page-title">Settings</h1><p className="lede">Your roster and quests stay in this browser. Choose exactly what leaves or gets removed.</p></header><div className="settings-list"><section><span>01</span><div><h2>Export account data</h2><p>Download this region's roster and saved quests as a JSON backup.</p></div><button className="text-action" type="button" onClick={onExport}>Export {region}</button></section><section><span>02</span><div><h2>Refresh Atlas catalogue</h2><p>Discard the local catalogue cache and load current regional records.</p></div><button className="text-action" type="button" onClick={onClearCache}>Refresh catalogue</button></section><section className="is-danger"><span>03</span><div><h2>Clear local account data</h2><p>Permanently remove this region's roster and saved quests. Export first if you may need them again.</p></div><button className="text-action" type="button" onClick={onClearData}>Clear {region} data</button></section></div></section>;
}

export default function App() {
  const repositories = useMemo(() => createBrowserInputRepositories(window.localStorage), []);
  const [region, setRegion] = useState<SupportedRegion>(Region.NA);
  const [area, setArea] = useState<Area>("clearOptimizer");
  const [step, setStep] = useState<Step>("quest");
  const [maxTurns, setMaxTurns] = useState(DEFAULT_MAX_TURNS);
  const [drafts, setDrafts] = useState<readonly ManualQuestDraft[]>([]);
  const [draft, setDraft] = useState<ManualQuestDraft>(() => newDraft(Region.NA));
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterProfile | null>(null);
  const [rosterCatalog, setRosterCatalog] = useState<RosterCatalogData | null>(null);
  const [rosterStatus, setRosterStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);
  const [traitCatalog, setTraitCatalog] = useState<readonly TraitCatalogEntry[]>([]);
  const [preferences, setPreferences] = useState<ClearQuestRunPreferences>({ minimizeCost: false, supportServantIds: DEFAULT_SUPPORT_SERVANT_IDS });
  const [runStatus, setRunStatus] = useState<"idle" | "running">("idle");
  const [runMessage, setRunMessage] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<ClearQuestRunResult | null>(null);
  const [upgradeStatus, setUpgradeStatus] = useState<"idle" | "running">("idle");
  const [upgrades, setUpgrades] = useState<UpgradeAdvisorReport | null>(null);
  const [upgradeMessage, setUpgradeMessage] = useState<string | null>(null);

  const readiness = useMemo(() => questReadiness(draft), [draft]);
  const rosterReady = roster?.region === region && rosterCatalog !== null;

  const preferredAttackers = useMemo(() => {
    if (roster?.region !== region || rosterCatalog === null) return [];
    return rosterCatalog.servants
      .filter((servant) => roster.ownedServants[servant.servantId] !== undefined)
      .map((servant) => ({ servantId: servant.servantId, name: servant.name }));
  }, [region, roster, rosterCatalog]);

  const supportOptions = useMemo(() => supportPickerOptions(rosterCatalog?.servants ?? []), [rosterCatalog]);

  useEffect(() => {
    let cancelled = false;
    repositories.questRepository.list(region).then((stored) => {
      if (cancelled) return;
      setDrafts(stored);
      setDraft(stored[0] ?? newDraft(region));
      setStatus("ready");
      setMessage(null);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setStatus("ready");
      setMessage(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [region, repositories]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([repositories.rosterRepository.load(region), loadRosterCatalog(region)]).then(([stored, catalog]) => {
      if (cancelled) return;
      setRoster(stored);
      setRosterCatalog(catalog);
      setRosterStatus("ready");
    }).catch((error: unknown) => {
      if (cancelled) return;
      setRosterStatus("ready");
      setRosterMessage(error instanceof Error ? error.message : String(error));
    });
    return () => { cancelled = true; };
  }, [region, repositories]);

  useEffect(() => {
    let cancelled = false;
    loadTraitCatalog()
      .then((catalog) => { if (!cancelled) setTraitCatalog(catalog); })
      .catch(() => { if (!cancelled) setTraitCatalog([]); });
    return () => { cancelled = true; };
  }, []);

  async function saveDraft() {
    setStatus("saving");
    setMessage(null);
    try {
      await repositories.questRepository.save(draft);
      setDrafts(await repositories.questRepository.list(region));
      setMessage("Quest saved locally.");
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStatus("ready");
    }
  }

  async function deleteDraft() {
    await repositories.questRepository.remove(region, draft.id);
    const stored = await repositories.questRepository.list(region);
    setDrafts(stored);
    setDraft(stored[0] ?? newDraft(region));
    setMessage("Quest removed.");
  }

  async function saveRoster() {
    if (!roster) return;
    setRosterStatus("saving");
    setRosterMessage(null);
    try {
      await repositories.rosterRepository.save(roster);
      setRosterMessage("Roster saved locally.");
    } catch (error: unknown) {
      setRosterMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRosterStatus("ready");
    }
  }

  async function runOptimizer() {
    setRunStatus("running");
    setRunMessage(null);
    setUpgradeStatus("idle");
    setUpgrades(null);
    setUpgradeMessage(null);
    setStatus("saving");
    try {
      await repositories.questRepository.save(draft);
      setDrafts(await repositories.questRepository.list(region));
      setRunResult(await runClearQuest({ region, draft, preferences, maxTurns }));
    } catch (error: unknown) {
      setRunMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setStatus("ready");
      setRunStatus("idle");
    }
  }

  function findUpgrades() {
    if (runResult === null) return;
    setUpgradeStatus("running");
    setUpgradeMessage(null);
    try { setUpgrades(findClearQuestUpgrades(runResult)); } catch (error: unknown) { setUpgradeMessage(error instanceof Error ? error.message : String(error)); } finally { setUpgradeStatus("idle"); }
  }

  function selectDraft(next: ManualQuestDraft) {
    setDraft(next);
    setMessage(null);
    setRunResult(null);
    setUpgrades(null);
  }

  function changeRegion(candidate: SupportedRegion) {
    setStatus("loading"); setRosterStatus("loading"); setRosterMessage(null); setPreferences({ minimizeCost: false });
    setRunStatus("idle"); setRunMessage(null); setRunResult(null); setUpgradeStatus("idle"); setUpgrades(null); setUpgradeMessage(null);
    setStep("quest"); setMaxTurns(DEFAULT_MAX_TURNS); setRegion(candidate);
  }

  function exportLocalData() {
    const keys = [`fgo-damage-calculator:roster:v1:${region}`, `fgo-damage-calculator:quests:v1:${region}`] as const;
    const data = Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key) === null ? null : JSON.parse(window.localStorage.getItem(key)!)]));
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, region, exportedAt: new Date().toISOString(), data }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `fgo-optimizer-${region.toLowerCase()}-export.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function clearCatalogueCache() {
    window.localStorage.removeItem(`fgo-damage-calculator:atlas-catalog:v2:${region}`);
    setRosterStatus("loading");
    try { setRosterCatalog(await loadRosterCatalog(region)); setRosterMessage("Atlas catalogue refreshed."); } catch (error: unknown) { setRosterMessage(error instanceof Error ? error.message : String(error)); } finally { setRosterStatus("ready"); }
  }

  async function clearLocalData() {
    if (!window.confirm(`Clear all ${region} roster and saved quest data from this browser? This cannot be undone.`)) return;
    window.localStorage.removeItem(`fgo-damage-calculator:roster:v1:${region}`);
    window.localStorage.removeItem(`fgo-damage-calculator:quests:v1:${region}`);
    setRoster(await repositories.rosterRepository.load(region));
    const stored = await repositories.questRepository.list(region);
    setDrafts(stored);
    setDraft(stored[0] ?? newDraft(region));
    setRosterMessage(`${region} local account data cleared.`);
    setMessage(`${region} saved quests cleared.`);
  }

  const rosterUnavailable = <p role="status" className="status-note">{rosterStatus === "loading" ? "Loading Atlas roster catalog…" : rosterMessage ?? "Roster is unavailable."}</p>;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="top-bar">
        <div className="top-bar__brand">
          <span className="wordmark">FGO Planner</span>
          <nav aria-label="Application sections" className="top-nav">
            {AREAS.map(([target, label]) => <button key={target} className={area === target ? "is-active" : ""} type="button" aria-current={area === target ? "page" : undefined} onClick={() => setArea(target)}>{label}</button>)}
          </nav>
        </div>
        <div className="top-bar__account">
          <button className={`text-action ${area === "settings" ? "is-active" : ""}`} type="button" aria-current={area === "settings" ? "page" : undefined} onClick={() => setArea("settings")}>Settings</button>
          <fieldset className="segmented" aria-label="Account region">
            <legend className="sr-only">Account region</legend>
            {REGION_OPTIONS.map((candidate) => (
              <label key={candidate} className={region === candidate ? "is-active" : ""}>
                <input className="sr-only" type="radio" name="region" value={candidate} checked={region === candidate} onChange={() => changeRegion(candidate)} />{candidate}
              </label>
            ))}
          </fieldset>
        </div>
      </header>

      {area === "clearOptimizer" && <StepBar step={step} questName={draft.name} canCompose={readiness.ready} onStepChange={setStep} />}

      <main id="main-content" className={`app-main app-main--${area}`}>
        {area === "settings" && <SettingsPanel region={region} onExport={exportLocalData} onClearCache={clearCatalogueCache} onClearData={clearLocalData} />}
        {area === "damageCalculator" && <DamageCalculatorPlaceholder />}
        {area === "servants" && (rosterReady ? <RosterEditor profile={roster} catalog={rosterCatalog} status={rosterStatus === "saving" ? "saving" : "ready"} message={rosterMessage} onChange={setRoster} onSave={saveRoster} /> : rosterUnavailable)}

        {area === "clearOptimizer" && step === "quest" && <div className="quest-step">
          <aside aria-label="Saved quests" className="side-panel quest-library">
            <div className="side-panel__head"><h2>Saved quests</h2><button className="secondary-action" type="button" onClick={() => selectDraft(newDraft(region))}>+ New</button></div>
            {status === "loading" ? <p className="hint">Loading…</p> : <ul>
              {drafts.map((stored) => <li key={stored.id}><button className={stored.id === draft.id ? "is-active" : ""} type="button" onClick={() => selectDraft(stored)}><strong>{stored.name}</strong><span>{stored.waves.length} wave{stored.waves.length === 1 ? "" : "s"} · {plural(stored.waves.reduce((sum, wave) => sum + wave.enemies.length, 0), "enemy", "enemies")}</span></button></li>)}
              {drafts.length === 0 && <li className="hint">No saved quests for {region}.</li>}
            </ul>}
          </aside>
          <div className="quest-step__main">
            {message && <p role="status" className="status-note">{message}</p>}
            <QuestEditor draft={draft} traitCatalog={traitCatalog} onDraftChange={setDraft} />
            <footer className="quest-footer">
              <p className={readiness.ready ? "hint" : "field-error"}>{readiness.ready ? readiness.message : `⚠ ${readiness.message}`}</p>
              <div>
                {drafts.some((stored) => stored.id === draft.id) && <button className="text-action" type="button" onClick={deleteDraft}>Delete</button>}
                <button className="secondary-action" type="button" disabled={status === "saving"} onClick={saveDraft}>{status === "saving" ? "Saving…" : "Save draft"}</button>
                <button className="primary-action" type="button" disabled={!readiness.ready} onClick={() => setStep("compose")}>Next: Find composition →</button>
              </div>
            </footer>
          </div>
        </div>}

        {area === "clearOptimizer" && step === "compose" && <div className="compose-step">
          <ClearQuestPreferences
            drafts={drafts.some((stored) => stored.id === draft.id) ? drafts : [draft, ...drafts]}
            selectedDraftId={draft.id}
            onSelectDraft={(id) => { const next = drafts.find((stored) => stored.id === id); if (next) selectDraft(next); }}
            collection={rosterReady ? { servants: Object.keys(roster.ownedServants).length, craftEssences: roster.craftEssenceInventory.length } : null}
            onOpenServants={() => setArea("servants")}
            maxTurns={maxTurns}
            onMaxTurnsChange={setMaxTurns}
            attackers={preferredAttackers}
            supportOptions={supportOptions}
            preferences={preferences}
            status={runStatus}
            message={runMessage}
            onChange={setPreferences}
            onRun={runOptimizer}
          />
          <ClearQuestResults run={runResult} maxTurns={maxTurns} upgrades={upgrades} upgradeStatus={upgradeStatus} upgradeMessage={upgradeMessage} onFindUpgrades={findUpgrades} />
        </div>}
      </main>
    </div>
  );
}
