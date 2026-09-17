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
import { createBrowserInputRepositories } from "./data/persistentInputs";
import { loadRosterCatalog, type RosterCatalogData } from "./data/rosterCatalog";
import RosterEditor from "./components/RosterEditor";

const CLASS_OPTIONS = [
  "saber", "archer", "lancer", "rider", "caster", "assassin", "berserker",
  "ruler", "avenger", "alterEgo", "moonCancer", "foreigner", "pretender",
] as const;
const ATTRIBUTE_OPTIONS = ["human", "earth", "sky", "star", "beast"] as const;
const REGION_OPTIONS: readonly SupportedRegion[] = [Region.NA, Region.JP];

function newDraft(region: SupportedRegion): ManualQuestDraft {
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `quest-${Date.now()}`;
  return createManualQuestDraft(region, id);
}

function parseTraits(value: string): readonly number[] | undefined {
  const traits = value.split(",").map((part) => Number(part.trim())).filter((trait) => Number.isInteger(trait));
  return traits.length === 0 ? undefined : traits;
}

function EnemyEditor({ enemy, waveIndex, enemyIndex, canRemove, onChange, onRemove }: {
  readonly enemy: ManualEnemyInput;
  readonly waveIndex: number;
  readonly enemyIndex: number;
  readonly canRemove: boolean;
  readonly onChange: (patch: Partial<ManualEnemyInput>) => void;
  readonly onRemove: () => void;
}) {
  const inputClass = "mt-1 w-full rounded-md border border-[var(--rule)] bg-[var(--ground-inset)] px-3 py-2 text-sm text-[var(--ink)]";
  return (
    <fieldset className="grid gap-3 border-t border-[var(--rule)] py-4 first:border-t-0 sm:grid-cols-2 lg:grid-cols-5">
      <legend className="sr-only">Wave {waveIndex + 1}, enemy {enemyIndex + 1}</legend>
      <label className="text-xs font-medium text-[var(--ink-dim)]">Position<span className="num mt-1 block py-2 text-sm text-[var(--ink)]">Enemy {enemyIndex + 1}</span></label>
      <label className="text-xs font-medium text-[var(--ink-dim)]">Class
        <select className={inputClass} value={enemy.className} onChange={(event) => onChange({ className: event.target.value as ManualEnemyInput["className"] })}>
          {CLASS_OPTIONS.map((className) => <option key={className} value={className}>{className}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--ink-dim)]">Attribute
        <select className={inputClass} value={enemy.attribute} onChange={(event) => onChange({ attribute: event.target.value as ManualEnemyInput["attribute"] })}>
          {ATTRIBUTE_OPTIONS.map((attribute) => <option key={attribute} value={attribute}>{attribute}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium text-[var(--ink-dim)]">HP
        <input className={`${inputClass} num`} type="number" min={1} value={enemy.hp} onChange={(event) => onChange({ hp: Number(event.target.value) })} />
      </label>
      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium text-[var(--ink-dim)]">Trait IDs
          <input className={`${inputClass} num`} value={(enemy.traits ?? []).join(", ")} placeholder="200, 201" onChange={(event) => onChange({ traits: parseTraits(event.target.value) })} />
        </label>
        <button className="mb-0.5 rounded-md border border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink-dim)] disabled:opacity-30" type="button" disabled={!canRemove} onClick={onRemove} aria-label={`Remove enemy ${enemyIndex + 1} from wave ${waveIndex + 1}`}>Remove</button>
      </div>
    </fieldset>
  );
}

function QuestEditor({ draft, onDraftChange }: { readonly draft: ManualQuestDraft; readonly onDraftChange: (draft: ManualQuestDraft) => void }) {
  return (
    <section aria-labelledby="quest-editor-title" className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-5">
        <label className="min-w-[16rem] flex-1 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-dim)]">Quest name
          <input id="quest-editor-title" className="mt-2 w-full border-0 border-b border-[var(--rule)] bg-transparent px-0 py-2 text-2xl font-semibold normal-case tracking-normal text-[var(--ink)]" value={draft.name} onChange={(event) => onDraftChange(renameManualQuest(draft, event.target.value))} />
        </label>
        <span className="num text-xs text-[var(--ink-dim)]">{draft.waves.length} wave{draft.waves.length === 1 ? "" : "s"}</span>
      </div>
      <div className="space-y-5">
        {draft.waves.map((wave, waveIndex) => (
          <section key={waveIndex} className="rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] px-4 sm:px-5">
            <header className="flex items-center justify-between border-b border-[var(--rule)] py-4">
              <div><p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">Wave</p><h2 className="num text-lg font-semibold">{String(waveIndex + 1).padStart(2, "0")}</h2></div>
              <div className="flex gap-2">
                <button className="rounded-md border border-[var(--rule)] px-3 py-2 text-sm disabled:opacity-30" type="button" disabled={wave.enemies.length >= 3} onClick={() => onDraftChange(addManualEnemy(draft, waveIndex))}>Add enemy</button>
                <button className="rounded-md border border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink-dim)] disabled:opacity-30" type="button" disabled={draft.waves.length === 1} onClick={() => onDraftChange(removeManualWave(draft, waveIndex))}>Remove wave</button>
              </div>
            </header>
            {wave.enemies.map((enemy, enemyIndex) => (
              <EnemyEditor key={enemyIndex} enemy={enemy} waveIndex={waveIndex} enemyIndex={enemyIndex} canRemove={wave.enemies.length > 1} onChange={(patch) => onDraftChange(updateManualEnemy(draft, waveIndex, enemyIndex, patch))} onRemove={() => onDraftChange(removeManualEnemy(draft, waveIndex, enemyIndex))} />
            ))}
          </section>
        ))}
      </div>
      <button className="mt-5 w-full rounded-lg border border-dashed border-[var(--rule)] py-3 text-sm text-[var(--ink-dim)]" type="button" onClick={() => onDraftChange(addManualWave(draft))}>Add wave</button>
    </section>
  );
}

export default function App() {
  const repositories = useMemo(() => createBrowserInputRepositories(window.localStorage), []);
  const [region, setRegion] = useState<SupportedRegion>(Region.NA);
  const [stage, setStage] = useState<"quest" | "roster">("quest");
  const [drafts, setDrafts] = useState<readonly ManualQuestDraft[]>([]);
  const [draft, setDraft] = useState<ManualQuestDraft>(() => newDraft(Region.NA));
  const [status, setStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterProfile | null>(null);
  const [rosterCatalog, setRosterCatalog] = useState<RosterCatalogData | null>(null);
  const [rosterStatus, setRosterStatus] = useState<"loading" | "ready" | "saving">("loading");
  const [rosterMessage, setRosterMessage] = useState<string | null>(null);

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

  return (
    <div className="min-h-svh bg-[var(--ground)] text-[var(--ink)]">
      <header className="border-b border-[var(--rule)] bg-[var(--ground-inset)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-4 py-5 sm:px-8">
          <div><p className="text-xs uppercase tracking-[0.22em] text-[var(--amber)]">Chaldea Operations</p><h1 className="mt-1 text-xl font-semibold">Quest Optimizer</h1></div>
          <nav aria-label="Optimizer modes" className="flex gap-1 rounded-md border border-[var(--rule)] bg-[var(--ground)] p-1 text-sm">
            <button className={`rounded-sm px-3 py-2 font-medium ${stage === "quest" ? "bg-[var(--ink)] text-[var(--ground)]" : "text-[var(--ink-dim)]"}`} type="button" aria-current={stage === "quest" ? "page" : undefined} onClick={() => setStage("quest")}>Quest</button>
            <button className={`rounded-sm px-3 py-2 font-medium ${stage === "roster" ? "bg-[var(--ink)] text-[var(--ground)]" : "text-[var(--ink-dim)]"}`} type="button" aria-current={stage === "roster" ? "page" : undefined} onClick={() => setStage("roster")}>Roster</button>
            <button className="px-3 py-2 text-[var(--ink-dim)]" type="button" disabled>Max Burst</button>
            <button className="px-3 py-2 text-[var(--ink-dim)]" type="button" disabled>Preferences</button>
            <button className="px-3 py-2 text-[var(--ink-dim)]" type="button" disabled>Results</button>
          </nav>
          <fieldset className="flex items-center gap-1 text-sm">
            <legend className="mr-2 inline text-xs uppercase tracking-[0.14em] text-[var(--ink-dim)]">Account</legend>
            {REGION_OPTIONS.map((candidate) => (
              <label key={candidate} className={`cursor-pointer rounded-md border px-3 py-2 ${region === candidate ? "border-[var(--focus)]" : "border-[var(--rule)] text-[var(--ink-dim)]"}`}>
                <input className="sr-only" type="radio" name="region" value={candidate} checked={region === candidate} onChange={() => { setStatus("loading"); setRosterStatus("loading"); setRosterMessage(null); setRegion(candidate); }} />{candidate}
              </label>
            ))}
          </fieldset>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-7 sm:px-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside aria-label="Saved quests" className="lg:border-r lg:border-[var(--rule)] lg:pr-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-dim)]">Saved nodes</h2><button className="text-sm text-[var(--focus)]" type="button" onClick={() => { setDraft(newDraft(region)); setMessage(null); }}>New</button></div>
          {status === "loading" ? <p className="text-sm text-[var(--ink-dim)]">Loading…</p> : <ul className="space-y-1">
            {drafts.map((stored) => <li key={stored.id}><button className={`w-full rounded-md px-3 py-2 text-left text-sm ${stored.id === draft.id ? "bg-[var(--ground-raised)]" : "text-[var(--ink-dim)] hover:bg-[var(--ground-raised)]"}`} type="button" onClick={() => { setDraft(stored); setMessage(null); }}><span className="block truncate">{stored.name}</span><span className="num text-xs">{stored.waves.length}W</span></button></li>)}
            {drafts.length === 0 && <li className="text-sm text-[var(--ink-dim)]">No saved nodes for {region}.</li>}
          </ul>}
          <div className="mt-7 border-t border-[var(--rule)] pt-5 text-xs leading-5 text-[var(--ink-dim)]">{stage === "quest" ? "Roster setup is the next input stage." : "Quest drafts remain available in the Quest stage."} Both input stages persist separately for JP and NA.</div>
        </aside>
        <div>
          {stage === "quest" ? <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">Step 1 of 4</p><h2 className="mt-1 text-lg font-semibold">Define the enemy node</h2></div>
              <div className="flex gap-2">
                {drafts.some((stored) => stored.id === draft.id) && <button className="rounded-md border border-[var(--rule)] px-4 py-2 text-sm text-[var(--ink-dim)]" type="button" onClick={deleteDraft}>Delete</button>}
                <button className="rounded-md bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-[#1a1200] disabled:opacity-50" type="button" disabled={status === "saving"} onClick={saveDraft}>{status === "saving" ? "Saving…" : "Save quest"}</button>
              </div>
            </div>
            {message && <p role="status" className="mb-4 rounded-md border border-[var(--rule)] bg-[var(--ground-raised)] px-3 py-2 text-sm">{message}</p>}
            <QuestEditor draft={draft} onDraftChange={setDraft} />
          </> : roster && rosterCatalog ? <RosterEditor profile={roster} catalog={rosterCatalog} status={rosterStatus === "saving" ? "saving" : "ready"} message={rosterMessage} onChange={setRoster} onSave={saveRoster} /> : <p role="status" className="rounded-md border border-[var(--rule)] bg-[var(--ground-raised)] px-3 py-3 text-sm text-[var(--ink-dim)]">{rosterStatus === "loading" ? "Loading Atlas roster catalog…" : rosterMessage ?? "Roster is unavailable."}</p>}
        </div>
      </main>
    </div>
  );
}
