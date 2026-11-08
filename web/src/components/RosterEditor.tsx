import {
  addRosterCraftEssence,
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
import MysticCodeDirectory from "./MysticCodeDirectory";
import { ceMatches, npOptionLabel, servantMatches, strengtheningLabel } from "./rosterPresentation";
import ServantAddDialog from "./ServantAddDialog";

type InventoryView = "servants" | "craftEssences" | "mysticCodes";
type OwnedServant = NonNullable<RosterProfile["ownedServants"][number]>;
type OwnedCraftEssence = RosterProfile["craftEssenceInventory"][number];

interface RosterEditorProps {
  readonly profile: RosterProfile;
  readonly catalog: RosterCatalogData;
  readonly status: "ready" | "saving";
  readonly message: string | null;
  readonly onChange: (profile: RosterProfile) => void;
  readonly onSave: () => void;
}

interface OwnedServantItem { readonly servant: OwnedServant; readonly entry: ServantCatalogEntry; }
interface OwnedCraftEssenceItem { readonly copy: OwnedCraftEssence; readonly entry: CraftEssenceCatalogEntry; readonly copyNumber: number; }

function Portrait({ src, name }: { readonly src: string | undefined; readonly name: string }) {
  const [failedSrc, setFailedSrc] = useState<string | undefined>();
  if (src === undefined || failedSrc === src) return <div className="portrait-fallback" aria-hidden="true">{name.slice(0, 2).toLocaleUpperCase() || "?"}</div>;
  return <img src={src} alt={name} loading="lazy" onError={() => setFailedSrc(src)} />;
}

function ServantInspector({ profile, servant, entry, onChange }: { readonly profile: RosterProfile; readonly servant: OwnedServant; readonly entry: ServantCatalogEntry; readonly onChange: (profile: RosterProfile) => void }) {
  const patch = (changes: Parameters<typeof updateRosterServant>[2]) => onChange(updateRosterServant(profile, servant.servantId, changes));
  const setSkill = (index: 0 | 1 | 2, value: number) => { const skillLevels = [...servant.skillLevels] as typeof servant.skillLevels; skillLevels[index] = value as typeof skillLevels[typeof index]; patch({ skillLevels }); };
  const toggleAppend = (slot: 1 | 2 | 3, checked: boolean) => { const appendSkillLevels = { ...servant.appendSkillLevels }; if (checked) appendSkillLevels[slot] = appendSkillLevels[slot] ?? 1; else delete appendSkillLevels[slot]; patch({ appendSkillLevels }); };
  const toggleStrengthening = (key: string, checked: boolean) => patch({ unlockedStrengthenings: checked ? [...new Set([...servant.unlockedStrengthenings, key])] : servant.unlockedStrengthenings.filter((value) => value !== key) });
  const selectedNpId = servant.selectedNpId ?? entry.npIds[0];
  const selectedNp = entry.npOptions?.find((np) => np.id === selectedNpId);

  return (
    <aside className="side-panel inventory-inspector" aria-label={`${entry.name} build`}>
      <div className="inventory-inspector__portrait"><Portrait src={entry.portraitUrl} name={entry.name} /><span>{entry.className ?? "Unknown class"}</span></div>
      <header><p className="eyebrow">Owned Servant</p><h2>{entry.name}</h2><p>{selectedNp === undefined ? "Noble Phantasm" : `${selectedNp.name} · ${selectedNp.card}`} · NP{servant.npLevel}</p></header>

      <div className="inspector-fields form-grid form-grid--two">
        <label>Level<input className="field-input" type="number" min={1} max={120} value={servant.level} onChange={(event) => patch({ level: Number(event.target.value) })} /></label>
        <label>Ascension<input className="field-input" type="number" min={0} max={4} value={servant.ascension} onChange={(event) => patch({ ascension: Number(event.target.value) as never })} /></label>
        <label>NP level<input className="field-input" type="number" min={1} max={5} value={servant.npLevel} onChange={(event) => patch({ npLevel: Number(event.target.value) as never })} /></label>
        <label>Bond<input className="field-input" type="number" min={0} max={15} value={servant.bondLevel} onChange={(event) => patch({ bondLevel: Number(event.target.value) })} /></label>
      </div>
      {entry.npIds.length > 1 && <label className="wide-field">Noble Phantasm form<select className="field-input" value={servant.selectedNpId ?? ""} onChange={(event) => patch({ selectedNpId: event.target.value === "" ? undefined : Number(event.target.value) })}><option value="">Select form</option>{entry.npIds.map((id) => <option key={id} value={id}>{npOptionLabel(entry, id)}</option>)}</select></label>}

      <section className="inspector-section">
        <p className="form-section-label">Skills</p>
        <div className="skill-levels">{[0, 1, 2].map((index) => <label key={index}><span className="skill-orb">{index + 1}</span><span>Skill {index + 1}</span><input className="field-input" type="number" min={1} max={10} value={servant.skillLevels[index]} onChange={(event) => setSkill(index as 0 | 1 | 2, Number(event.target.value))} /></label>)}</div>
      </section>

      <section className="inspector-section">
        <p className="form-section-label">Append skills</p>
        <div className="append-list">{[1, 2, 3].map((slot) => <label key={slot}><input type="checkbox" checked={servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined} onChange={(event) => toggleAppend(slot as 1 | 2 | 3, event.target.checked)} /><span>Append {slot}</span>{servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined && <input aria-label={`Append skill ${slot} level`} className="field-input" type="number" min={1} max={10} value={servant.appendSkillLevels[slot as 1 | 2 | 3]} onChange={(event) => patch({ appendSkillLevels: { ...servant.appendSkillLevels, [slot]: Number(event.target.value) as never } })} />}</label>)}</div>
      </section>

      <section className="inspector-section form-grid form-grid--two">
        <label>ATK Fou<input className="field-input" type="number" min={0} max={2000} value={servant.fou.atk} onChange={(event) => patch({ fou: { ...servant.fou, atk: Number(event.target.value) } })} /></label>
        <label>HP Fou<input className="field-input" type="number" min={0} max={2000} value={servant.fou.hp} onChange={(event) => patch({ fou: { ...servant.fou, hp: Number(event.target.value) } })} /></label>
      </section>

      {entry.strengtheningKeys.length > 0 && <section className="inspector-section"><p className="form-section-label">Cleared strengthenings</p><div className="check-list">{entry.strengtheningKeys.map((key, index) => <label key={key}><input type="checkbox" checked={servant.unlockedStrengthenings.includes(key)} onChange={(event) => toggleStrengthening(key, event.target.checked)} />{strengtheningLabel(key, index)}</label>)}</div></section>}

      <button className="danger-link" type="button" onClick={() => onChange(removeRosterServant(profile, servant.servantId))}>Remove from roster</button>
    </aside>
  );
}

function CraftEssenceInspector({ profile, copy, entry, copyNumber, onChange }: { readonly profile: RosterProfile; readonly copy: OwnedCraftEssence; readonly entry: CraftEssenceCatalogEntry; readonly copyNumber: number; readonly onChange: (profile: RosterProfile) => void }) {
  const cap = entry.levelCaps[Math.min(copy.limitBreakCount, entry.levelCaps.length - 1)] ?? 100;
  const patch = (changes: Parameters<typeof updateRosterCraftEssence>[2]) => onChange(updateRosterCraftEssence(profile, copy.id, changes));
  return (
    <aside className="side-panel inventory-inspector" aria-label={`${entry.name} copy ${copyNumber}`}>
      <div className="inventory-inspector__portrait inventory-inspector__portrait--ce"><Portrait src={entry.portraitUrl} name={entry.name} /><span>Copy {copyNumber}</span></div>
      <header><p className="eyebrow">Owned Craft Essence</p><h2>{entry.name}</h2><p>Level {copy.level} · Limit Break {copy.limitBreakCount}/4</p></header>
      <div className="inspector-fields form-grid form-grid--two">
        <label>Level<input className="field-input" type="number" min={1} max={cap} value={copy.level} onChange={(event) => patch({ level: Number(event.target.value) })} /></label>
        <label>Limit Break<select className="field-input" value={copy.limitBreakCount} onChange={(event) => patch({ limitBreakCount: Number(event.target.value) as never })}>{[0, 1, 2, 3, 4].map((lb) => <option key={lb} value={lb}>{lb}/4</option>)}</select></label>
      </div>
      <p className="inspector-note">Current level cap: <strong>{cap}</strong>. Every copy stays separate so CE assignments match your account.</p>
      <button className="danger-link" type="button" onClick={() => onChange(removeRosterCraftEssence(profile, copy.id))}>Remove this copy</button>
    </aside>
  );
}

function CraftEssencePicker({ entries, query, onQueryChange, onAdd, onClose }: { readonly entries: readonly CraftEssenceCatalogEntry[]; readonly query: string; readonly onQueryChange: (query: string) => void; readonly onAdd: (entry: CraftEssenceCatalogEntry) => void; readonly onClose: () => void }) {
  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="collection-dialog collection-dialog--compact" role="dialog" aria-modal="true" aria-labelledby="add-ce-title">
        <header className="collection-dialog__header"><div><p className="eyebrow">Catalogue</p><h2 id="add-ce-title">Add a Craft Essence</h2><p>Each saved entry represents one physical copy in your account.</p></div><button className="quiet-action" type="button" onClick={onClose}>Close</button></header>
        <div className="collection-dialog__body">
          <label className="search-line"><span>Search Craft Essences</span><input autoFocus type="search" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Type a name" /></label>
          <div className="ce-picker-grid">{entries.map((entry) => <button key={entry.craftEssenceId} type="button" onClick={() => onAdd(entry)}><div><Portrait src={entry.portraitUrl} name={entry.name} /></div><strong>{entry.name}</strong><small>Add copy</small></button>)}</div>
          {entries.length === 0 && <div className="empty-state"><span className="empty-state__mark">0</span><p>No Craft Essences match this search.</p></div>}
        </div>
      </section>
    </div>
  );
}

export default function RosterEditor({ profile, catalog, status, message, onChange, onSave }: RosterEditorProps) {
  const [activeInventory, setActiveInventory] = useState<InventoryView>("servants");
  const [servantQuery, setServantQuery] = useState("");
  const [servantClass, setServantClass] = useState("");
  const [ceQuery, setCeQuery] = useState("");
  const [ceCatalogQuery, setCeCatalogQuery] = useState("");
  const [requestedServantId, setRequestedServantId] = useState<number | null>(null);
  const [requestedCeId, setRequestedCeId] = useState<string | null>(null);
  const [showServantAdd, setShowServantAdd] = useState(false);
  const [showCeAdd, setShowCeAdd] = useState(false);
  const validation = useMemo(() => validateRoster(profile, catalog), [profile, catalog]);
  const servantMap = useMemo(() => new Map(catalog.servants.map((entry) => [entry.servantId, entry])), [catalog.servants]);
  const ceMap = useMemo(() => new Map(catalog.craftEssences.map((entry) => [entry.craftEssenceId, entry])), [catalog.craftEssences]);
  const servants = useMemo<readonly OwnedServantItem[]>(() => Object.values(profile.ownedServants).flatMap((servant) => { const entry = servantMap.get(servant.servantId); return entry === undefined ? [] : [{ servant, entry }]; }), [profile.ownedServants, servantMap]);
  const craftEssences = useMemo<readonly OwnedCraftEssenceItem[]>(() => profile.craftEssenceInventory.flatMap((copy, index) => { const entry = ceMap.get(copy.craftEssenceId); return entry === undefined ? [] : [{ copy, entry, copyNumber: index + 1 }]; }), [profile.craftEssenceInventory, ceMap]);
  const classes = [...new Set(servants.map(({ entry }) => entry.className ?? "Unknown class"))].sort();
  const visibleServants = servants.filter(({ entry }) => servantMatches(entry, servantQuery) && (servantClass === "" || entry.className === servantClass));
  const visibleCraftEssences = craftEssences.filter(({ entry }) => ceMatches(entry, ceQuery));
  const ceCatalogResults = catalog.craftEssences.filter((entry) => ceMatches(entry, ceCatalogQuery)).slice(0, 30);
  const selectedServant = servants.find(({ servant }) => servant.servantId === requestedServantId) ?? servants[0];
  const selectedCe = craftEssences.find(({ copy }) => copy.id === requestedCeId) ?? craftEssences[0];

  const addCraftEssence = (entry: CraftEssenceCatalogEntry) => {
    const next = addRosterCraftEssence(profile, entry, { level: entry.levelCaps[0] ?? 1, limitBreakCount: 0 });
    onChange(next);
    setRequestedCeId(next.craftEssenceInventory[next.craftEssenceInventory.length - 1]?.id ?? null);
    setShowCeAdd(false);
    setCeCatalogQuery("");
  };

  const tabs: readonly (readonly [InventoryView, string, number])[] = [
    ["servants", "Servants", servants.length],
    ["craftEssences", "Craft Essences", craftEssences.length],
    ["mysticCodes", "Mystic Codes", profile.mysticCodes.length],
  ];
  const query = activeInventory === "servants" ? servantQuery : ceQuery;

  return (
    <section aria-labelledby="roster-editor-title" className="collection-page">
      <h1 id="roster-editor-title" className="sr-only">Servants</h1>
      <aside className="side-panel filter-rail" aria-label="Collection filters and account">
        {activeInventory !== "mysticCodes" && <label className="field-label">Search
          <input className="field-input" type="search" value={query} onChange={(event) => activeInventory === "servants" ? setServantQuery(event.target.value) : setCeQuery(event.target.value)} placeholder="Name" />
        </label>}
        {activeInventory === "servants" && <section className="panel-section">
          <h3 id="class-filter-label">Class</h3>
          <div className="chip-row" role="radiogroup" aria-labelledby="class-filter-label">
            {["", ...classes].map((className) => <button key={className || "all"} type="button" role="radio" aria-checked={servantClass === className} className={`chip ${servantClass === className ? "is-on" : ""}`} onClick={() => setServantClass(className)}>{className || "All"}</button>)}
          </div>
        </section>}
        <section className="panel-section">
          <h3>Account</h3>
          <label className="field-label">Master level<input className="field-input num" type="number" min={1} max={190} value={profile.masterLevel} onChange={(event) => onChange({ ...profile, masterLevel: Number(event.target.value) })} /></label>
          <p className="hint">Sets the party-cost budget the optimizer uses.</p>
        </section>
        <button className="primary-action primary-action--block" type="button" disabled={!validation.valid || status === "saving"} onClick={onSave}>{status === "saving" ? "Saving…" : "Save collection"}</button>
        {message && <p role="status" className="hint">{message}</p>}
      </aside>

      <div className="collection-main">
        <div className="collection-main__head">
          <div className="segmented" role="tablist" aria-label="Inventory categories">
            {tabs.map(([id, label, count]) => <button key={id} type="button" role="tab" aria-selected={activeInventory === id} className={activeInventory === id ? "is-active" : ""} onClick={() => setActiveInventory(id)}>{label} <span className="num">{count}</span></button>)}
          </div>
          {activeInventory !== "mysticCodes" && <button className="primary-action" type="button" onClick={() => activeInventory === "servants" ? setShowServantAdd(true) : setShowCeAdd(true)}>+ Add {activeInventory === "servants" ? "servant" : "CE"}</button>}
        </div>
        {!validation.valid && <div role="alert" className="validation-note"><strong>Some build details need attention.</strong><ul>{validation.issues.slice(0, 6).map((issue, index) => <li key={`${issue.path}-${index}`}>{issue.message}</li>)}</ul></div>}

        {activeInventory === "mysticCodes" ? <MysticCodeDirectory entries={catalog.mysticCodes} owned={profile.mysticCodes} onAdd={(entry) => onChange(setRosterMysticCode(profile, entry, 1))} onLevelChange={(entry, level) => onChange(setRosterMysticCode(profile, entry, level))} />
          : activeInventory === "servants" ? visibleServants.length === 0 ? <div className="empty-card"><p>{servants.length === 0 ? "Add the servants you own to start your collection." : "No owned servants match these filters."}</p></div> : <><p className="hint">{visibleServants.length} of {servants.length} servants · {profile.region} account</p><div className="portrait-gallery">{visibleServants.map(({ servant, entry }) => <button key={servant.servantId} type="button" aria-pressed={selectedServant?.servant.servantId === servant.servantId} className={selectedServant?.servant.servantId === servant.servantId ? "is-selected" : ""} onClick={() => setRequestedServantId(servant.servantId)}><div><Portrait src={entry.portraitUrl} name={entry.name} /></div><strong>{entry.name}</strong><small>{entry.className ?? "Unknown"}</small><small>Lv {servant.level} · NP{servant.npLevel} · {servant.skillLevels.join("/")}</small></button>)}</div></>
          : visibleCraftEssences.length === 0 ? <div className="empty-card"><p>{craftEssences.length === 0 ? "Add every Craft Essence copy you own." : "No owned Craft Essences match this search."}</p></div> : <div className="portrait-gallery portrait-gallery--ce">{visibleCraftEssences.map(({ copy, entry, copyNumber }) => <button key={copy.id} type="button" aria-pressed={selectedCe?.copy.id === copy.id} className={selectedCe?.copy.id === copy.id ? "is-selected" : ""} onClick={() => setRequestedCeId(copy.id)}><div><Portrait src={entry.portraitUrl} name={entry.name} /></div><strong>{entry.name}</strong><small>Copy {copyNumber} · Lv {copy.level} · LB {copy.limitBreakCount}/4</small></button>)}</div>}
      </div>

      {activeInventory === "servants" ? selectedServant === undefined ? <aside className="side-panel inventory-inspector inventory-inspector--empty">Select a servant to edit its build.</aside> : <ServantInspector profile={profile} servant={selectedServant.servant} entry={selectedServant.entry} onChange={onChange} />
        : activeInventory === "craftEssences" ? selectedCe === undefined ? <aside className="side-panel inventory-inspector inventory-inspector--empty">Select a Craft Essence copy to edit it.</aside> : <CraftEssenceInspector profile={profile} copy={selectedCe.copy} entry={selectedCe.entry} copyNumber={selectedCe.copyNumber} onChange={onChange} />
        : null}

      {showServantAdd && <ServantAddDialog profile={profile} catalog={catalog} onChange={onChange} onSelect={setRequestedServantId} onClose={() => setShowServantAdd(false)} />}
      {showCeAdd && <CraftEssencePicker entries={ceCatalogResults} query={ceCatalogQuery} onQueryChange={setCeCatalogQuery} onAdd={addCraftEssence} onClose={() => setShowCeAdd(false)} />}
    </section>
  );
}
