import {
  addRosterCraftEssence,
  addRosterServant,
  removeRosterCraftEssence,
  removeRosterServant,
  setRosterMysticCode,
  updateRosterCraftEssence,
  updateRosterServant,
  validateRoster,
  type CraftEssenceCatalogEntry,
  type RosterProfile,
  type ServantCatalogEntry,
} from "fgo-damage-calculator/account";
import { useMemo, useState } from "react";
import type { RosterCatalogData } from "../data/rosterCatalog";

const inputClass = "mt-1 w-full rounded-md border border-[var(--rule)] bg-[var(--ground-inset)] px-3 py-2 text-sm text-[var(--ink)]";
const buttonClass = "rounded-md border border-[var(--rule)] px-3 py-2 text-sm text-[var(--ink)] hover:border-[var(--focus)] disabled:cursor-not-allowed disabled:opacity-40";

interface RosterEditorProps {
  readonly profile: RosterProfile;
  readonly catalog: RosterCatalogData;
  readonly status: "ready" | "saving";
  readonly message: string | null;
  readonly onChange: (profile: RosterProfile) => void;
  readonly onSave: () => void;
}

function numericValue(event: { target: { value: string } }): number {
  return Number(event.target.value);
}

function servantMatches(entry: ServantCatalogEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0 || entry.name.toLocaleLowerCase().includes(needle) ||
    String(entry.collectionNo).includes(needle) || String(entry.servantId).includes(needle);
}

function ceMatches(entry: CraftEssenceCatalogEntry, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  return needle.length === 0 || entry.name.toLocaleLowerCase().includes(needle) ||
    String(entry.collectionNo).includes(needle) || String(entry.craftEssenceId).includes(needle);
}

function ServantBuildEditor({ profile, servant, catalog, onChange }: {
  readonly profile: RosterProfile;
  readonly servant: NonNullable<RosterProfile["ownedServants"][number]>;
  readonly catalog: ServantCatalogEntry;
  readonly onChange: (profile: RosterProfile) => void;
}) {
  const patch = (changes: Parameters<typeof updateRosterServant>[2]) => onChange(updateRosterServant(profile, servant.servantId, changes));
  const setSkill = (index: 0 | 1 | 2, value: number) => {
    const skillLevels = [...servant.skillLevels] as typeof servant.skillLevels;
    skillLevels[index] = value as typeof skillLevels[typeof index];
    patch({ skillLevels });
  };
  const toggleAppend = (slot: 1 | 2 | 3, checked: boolean) => {
    const appendSkillLevels = { ...servant.appendSkillLevels };
    if (checked) appendSkillLevels[slot] = appendSkillLevels[slot] ?? 1;
    else delete appendSkillLevels[slot];
    patch({ appendSkillLevels });
  };
  const toggleStrengthening = (key: string, checked: boolean) => {
    const unlockedStrengthenings = checked
      ? [...new Set([...servant.unlockedStrengthenings, key])]
      : servant.unlockedStrengthenings.filter((current) => current !== key);
    patch({ unlockedStrengthenings });
  };

  return (
    <fieldset className="rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] p-4 sm:p-5">
      <legend className="sr-only">{catalog.name} servant build</legend>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="font-semibold">{catalog.name}</h3><p className="num text-xs text-[var(--ink-dim)]">No. {catalog.collectionNo}</p></div>
        <button className="text-sm text-[var(--ink-dim)] hover:text-[var(--ink)]" type="button" onClick={() => onChange(removeRosterServant(profile, servant.servantId))}>Remove servant</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium text-[var(--ink-dim)]">Level
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-level`} type="number" min={1} max={120} value={servant.level} onChange={(event) => patch({ level: numericValue(event) })} />
        </label>
        <label className="text-xs font-medium text-[var(--ink-dim)]">Ascension
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-ascension`} type="number" min={0} max={4} value={servant.ascension} onChange={(event) => patch({ ascension: numericValue(event) as never })} />
        </label>
        <label className="text-xs font-medium text-[var(--ink-dim)]">NP level
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-np-level`} type="number" min={1} max={5} value={servant.npLevel} onChange={(event) => patch({ npLevel: numericValue(event) as never })} />
        </label>
        <label className="text-xs font-medium text-[var(--ink-dim)]">Bond level
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-bond-level`} type="number" min={0} max={15} value={servant.bondLevel} onChange={(event) => patch({ bondLevel: numericValue(event) })} />
        </label>
      </div>
      {catalog.npIds.length > 1 && <label className="mt-3 block text-xs font-medium text-[var(--ink-dim)]">Noble Phantasm form
        <select className={inputClass} name={`servant-${servant.servantId}-np-form`} value={servant.selectedNpId ?? ""} onChange={(event) => patch({ selectedNpId: event.target.value === "" ? undefined : Number(event.target.value) })}>
          <option value="">Select NP form</option>
          {catalog.npIds.map((id) => <option key={id} value={id}>NP {id}</option>)}
        </select>
      </label>}
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => <label key={index} className="text-xs font-medium text-[var(--ink-dim)]">Skill {index + 1}
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-skill-${index + 1}`} type="number" min={1} max={10} value={servant.skillLevels[index]} onChange={(event) => setSkill(index as 0 | 1 | 2, numericValue(event))} />
        </label>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((slot) => <label key={slot} className="flex items-center gap-2 text-xs text-[var(--ink-dim)]">
          <input name={`servant-${servant.servantId}-append-${slot}-enabled`} type="checkbox" checked={servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined} onChange={(event) => toggleAppend(slot as 1 | 2 | 3, event.target.checked)} />
          Append {slot}
          {servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined && <input aria-label={`Append skill ${slot} level`} className={`${inputClass} num mt-0 w-20`} name={`servant-${servant.servantId}-append-${slot}-level`} type="number" min={1} max={10} value={servant.appendSkillLevels[slot as 1 | 2 | 3]} onChange={(event) => patch({ appendSkillLevels: { ...servant.appendSkillLevels, [slot]: numericValue(event) as never } })} />}
        </label>)}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-medium text-[var(--ink-dim)]">ATK Fou
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-atk-fou`} type="number" min={0} max={2000} value={servant.fou.atk} onChange={(event) => patch({ fou: { ...servant.fou, atk: numericValue(event) } })} />
        </label>
        <label className="text-xs font-medium text-[var(--ink-dim)]">HP Fou
          <input className={`${inputClass} num`} name={`servant-${servant.servantId}-hp-fou`} type="number" min={0} max={2000} value={servant.fou.hp} onChange={(event) => patch({ fou: { ...servant.fou, hp: numericValue(event) } })} />
        </label>
      </div>
      {catalog.strengtheningKeys.length > 0 && <fieldset className="mt-4 border-t border-[var(--rule)] pt-4"><legend className="text-xs font-medium text-[var(--ink-dim)]">Cleared strengthenings</legend><div className="mt-2 grid gap-2 sm:grid-cols-2">{catalog.strengtheningKeys.map((key) => <label key={key} className="flex items-center gap-2 text-xs text-[var(--ink-dim)]"><input name={`servant-${servant.servantId}-strengthening-${key}`} type="checkbox" checked={servant.unlockedStrengthenings.includes(key)} onChange={(event) => toggleStrengthening(key, event.target.checked)} />{key}</label>)}</div></fieldset>}
    </fieldset>
  );
}

export default function RosterEditor({ profile, catalog, status, message, onChange, onSave }: RosterEditorProps) {
  const [servantQuery, setServantQuery] = useState("");
  const [ceQuery, setCeQuery] = useState("");
  const [selectedServantId, setSelectedServantId] = useState<number | null>(null);
  const validation = useMemo(() => validateRoster(profile, catalog), [profile, catalog]);
  const servantMap = useMemo(() => new Map(catalog.servants.map((entry) => [entry.servantId, entry])), [catalog.servants]);
  const servantResults = catalog.servants.filter((entry) => servantMatches(entry, servantQuery)).slice(0, 12);
  const ceResults = catalog.craftEssences.filter((entry) => ceMatches(entry, ceQuery)).slice(0, 12);
  const selectedServant = selectedServantId === null ? undefined : profile.ownedServants[selectedServantId];
  const selectedCatalog = selectedServantId === null ? undefined : servantMap.get(selectedServantId);

  return (
    <section aria-labelledby="roster-editor-title" className="min-w-0">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-5"><div><p className="text-xs uppercase tracking-[0.16em] text-[var(--ink-dim)]">Step 2 of 4 · {profile.region} account</p><h2 id="roster-editor-title" className="mt-1 text-lg font-semibold">Build your roster</h2></div><button className="rounded-md bg-[var(--amber)] px-4 py-2 text-sm font-semibold text-[#1a1200] disabled:opacity-50" type="button" disabled={!validation.valid || status === "saving"} onClick={onSave}>{status === "saving" ? "Saving…" : "Save roster"}</button></div>
      {message && <p role="status" className="mb-4 rounded-md border border-[var(--rule)] bg-[var(--ground-raised)] px-3 py-2 text-sm">{message}</p>}
      {!validation.valid && <div role="alert" className="mb-5 rounded-md border border-[#8d5b5b] bg-[#321d22] px-3 py-3 text-sm"><p className="font-medium">Fix these fields before saving:</p><ul className="mt-1 list-disc pl-5 text-[var(--ink-dim)]">{validation.issues.slice(0, 8).map((issue) => <li key={issue.path}><span className="num">{issue.path}</span>: {issue.message}</li>)}</ul></div>}
      <div className="grid gap-5 rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] p-4 sm:grid-cols-3 sm:p-5"><label className="text-xs font-medium text-[var(--ink-dim)]">Master level<input className={`${inputClass} num`} name="masterLevel" type="number" min={1} max={190} value={profile.masterLevel} onChange={(event) => onChange({ ...profile, masterLevel: numericValue(event) })} /></label><div className="sm:col-span-2 self-end text-sm text-[var(--ink-dim)]">JP and NA rosters are saved independently. Unsupported fields such as Command Codes and support presets are preserved.</div></div>
      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(16rem,0.75fr)_minmax(0,1.25fr)]">
        <section aria-labelledby="servant-search-title" className="rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] p-4 sm:p-5"><h3 id="servant-search-title" className="font-semibold">Servants</h3><label className="mt-3 block text-xs font-medium text-[var(--ink-dim)]">Search by name or collection number<input className={inputClass} name="servantSearch" type="search" value={servantQuery} onChange={(event) => setServantQuery(event.target.value)} placeholder="e.g. 2 or Altria" /></label><div className="mt-3 max-h-80 space-y-1 overflow-y-auto">{servantResults.map((entry) => { const owned = profile.ownedServants[entry.servantId] !== undefined; return <button key={entry.servantId} className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${selectedServantId === entry.servantId ? "bg-[var(--ground-inset)]" : "hover:bg-[var(--ground-inset)]"}`} type="button" onClick={() => { setSelectedServantId(entry.servantId); if (!owned) onChange(addRosterServant(profile, entry)); }}><span className="truncate">{entry.name}<span className="num ml-2 text-xs text-[var(--ink-dim)]">No. {entry.collectionNo}</span></span><span className="text-xs text-[var(--focus)]">{owned ? "Owned" : "Add"}</span></button>; })}</div><p className="mt-3 text-xs text-[var(--ink-dim)]">{Object.keys(profile.ownedServants).length} owned servant{Object.keys(profile.ownedServants).length === 1 ? "" : "s"}</p></section>
        <div>{selectedServant && selectedCatalog ? <ServantBuildEditor profile={profile} servant={selectedServant} catalog={selectedCatalog} onChange={onChange} /> : <div className="rounded-lg border border-dashed border-[var(--rule)] p-8 text-sm text-[var(--ink-dim)]">Select a servant to edit investment details.</div>}</div>
      </div>
      <section aria-labelledby="ce-title" className="mt-5 rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="ce-title" className="font-semibold">Craft Essences</h3><span className="num text-xs text-[var(--ink-dim)]">{profile.craftEssenceInventory.length} copies</span></div><label className="mt-3 block text-xs font-medium text-[var(--ink-dim)]">Search by name or collection number<input className={inputClass} name="craftEssenceSearch" type="search" value={ceQuery} onChange={(event) => setCeQuery(event.target.value)} placeholder="e.g. 34 or Kaleidoscope" /></label><div className="mt-3 grid gap-2 sm:grid-cols-2">{ceResults.map((entry) => <button key={entry.craftEssenceId} className={`${buttonClass} text-left`} type="button" onClick={() => onChange(addRosterCraftEssence(profile, entry, { level: entry.levelCaps[0] ?? 1, limitBreakCount: 0 }))}>Add {entry.name}<span className="num ml-2 text-xs text-[var(--ink-dim)]">No. {entry.collectionNo}</span></button>)}</div><div className="mt-4 space-y-2">{profile.craftEssenceInventory.map((copy, index) => { const entry = catalog.craftEssences.find((candidate) => candidate.craftEssenceId === copy.craftEssenceId); if (!entry) return null; const cap = entry.levelCaps[Math.min(copy.limitBreakCount, entry.levelCaps.length - 1)] ?? 100; return <div key={copy.id} className="grid gap-2 rounded-md border border-[var(--rule)] p-3 sm:grid-cols-[minmax(0,1fr)_6rem_8rem_auto] sm:items-end"><div><p className="text-sm">{entry.name}</p><p className="num text-xs text-[var(--ink-dim)]">Copy {index + 1} · No. {entry.collectionNo}</p></div><label className="text-xs text-[var(--ink-dim)]">Level<input className={`${inputClass} num`} name={`ce-${copy.id}-level`} type="number" min={1} max={cap} value={copy.level} onChange={(event) => onChange(updateRosterCraftEssence(profile, copy.id, { level: numericValue(event) }))} /></label><label className="text-xs text-[var(--ink-dim)]">Limit break<select className={`${inputClass} num`} name={`ce-${copy.id}-limit-break`} value={copy.limitBreakCount} onChange={(event) => onChange(updateRosterCraftEssence(profile, copy.id, { limitBreakCount: numericValue(event) as never }))}>{[0, 1, 2, 3, 4].map((lb) => <option key={lb} value={lb}>{lb}/4</option>)}</select></label><button className="text-sm text-[var(--ink-dim)]" type="button" onClick={() => onChange(removeRosterCraftEssence(profile, copy.id))}>Remove</button></div>; })}</div></section>
      <section aria-labelledby="mystic-code-title" className="mt-5 rounded-lg border border-[var(--rule)] bg-[var(--ground-raised)] p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 id="mystic-code-title" className="font-semibold">Mystic Codes</h3><span className="text-xs text-[var(--ink-dim)]">Level 1–10</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{catalog.mysticCodes.map((entry) => { const owned = profile.mysticCodes.find((code) => code.mysticCodeId === entry.mysticCodeId); return <div key={entry.mysticCodeId} className="grid grid-cols-[minmax(0,1fr)_5rem] items-end gap-2"><div className="text-sm">{entry.name}<span className="num ml-2 text-xs text-[var(--ink-dim)]">{entry.mysticCodeId}</span>{!owned && <button className={`${buttonClass} mt-2 w-full text-left`} type="button" onClick={() => onChange(setRosterMysticCode(profile, entry, 1))}>Add</button>}</div>{owned && <label className="text-xs text-[var(--ink-dim)]">Level<input className={`${inputClass} num`} name={`mystic-code-${entry.mysticCodeId}-level`} type="number" min={1} max={10} value={owned.level} onChange={(event) => onChange(setRosterMysticCode(profile, entry, numericValue(event)))} /></label>}</div>; })}</div></section>
    </section>
  );
}
