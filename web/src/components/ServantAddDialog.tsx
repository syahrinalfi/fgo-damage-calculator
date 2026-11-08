import {
  addRosterServant,
  updateRosterServant,
  type RosterProfile,
  type ServantCatalogEntry,
} from "fgo-damage-calculator/account";
import { useEffect, useMemo, useState } from "react";
import type { RosterCatalogData } from "../data/rosterCatalog";
import { npOptionLabel, servantMatches, strengtheningLabel } from "./rosterPresentation";

interface ServantAddDialogProps {
  readonly profile: RosterProfile;
  readonly catalog: RosterCatalogData;
  readonly onChange: (profile: RosterProfile) => void;
  readonly onSelect: (servantId: number) => void;
  readonly onClose: () => void;
}

function Portrait({ src, name }: { readonly src: string | undefined; readonly name: string }) {
  const [failed, setFailed] = useState(false);
  if (src === undefined || failed) return <div className="portrait-fallback" aria-hidden="true">{name.slice(0, 2).toLocaleUpperCase() || "?"}</div>;
  return <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} />;
}

function BuildStage({ profile, entry, onChange }: { readonly profile: RosterProfile; readonly entry: ServantCatalogEntry; readonly onChange: (profile: RosterProfile) => void }) {
  const servant = profile.ownedServants[entry.servantId];
  if (servant === undefined) return null;
  const patch = (changes: Parameters<typeof updateRosterServant>[2]) => onChange(updateRosterServant(profile, servant.servantId, changes));
  const setSkill = (index: 0 | 1 | 2, value: number) => {
    const skillLevels = [...servant.skillLevels] as typeof servant.skillLevels;
    skillLevels[index] = Math.max(1, Math.min(10, value)) as typeof skillLevels[typeof index];
    patch({ skillLevels });
  };
  const toggleAppend = (slot: 1 | 2 | 3, checked: boolean) => {
    const appendSkillLevels = { ...servant.appendSkillLevels };
    if (checked) appendSkillLevels[slot] = appendSkillLevels[slot] ?? 1;
    else delete appendSkillLevels[slot];
    patch({ appendSkillLevels });
  };
  const toggleStrengthening = (key: string, checked: boolean) => patch({ unlockedStrengthenings: checked ? [...new Set([...servant.unlockedStrengthenings, key])] : servant.unlockedStrengthenings.filter((value) => value !== key) });
  const selectedNp = entry.npOptions?.find((np) => np.id === (servant.selectedNpId ?? entry.npIds[0]));

  return (
    <div className="build-dialog">
      <aside className="build-dialog__art">
        <Portrait src={entry.portraitUrl} name={entry.name} />
        <div><p>{entry.className ?? "Unknown class"}</p><h3>{entry.name}</h3><span>{selectedNp === undefined ? "Choose a Noble Phantasm form" : `${selectedNp.name} · ${selectedNp.card}`}</span></div>
      </aside>
      <div className="build-form">
        <section>
          <p className="form-section-label">Core build</p>
          <div className="form-grid form-grid--four">
            <label>Level<input className="field-input" type="number" min={1} max={120} value={servant.level} onChange={(event) => patch({ level: Number(event.target.value) })} /></label>
            <label>Ascension<input className="field-input" type="number" min={0} max={4} value={servant.ascension} onChange={(event) => patch({ ascension: Number(event.target.value) as never })} /></label>
            <label>NP level<input className="field-input" type="number" min={1} max={5} value={servant.npLevel} onChange={(event) => patch({ npLevel: Number(event.target.value) as never })} /></label>
            <label>Bond<input className="field-input" type="number" min={0} max={15} value={servant.bondLevel} onChange={(event) => patch({ bondLevel: Number(event.target.value) })} /></label>
          </div>
          {entry.npIds.length > 1 && <label className="wide-field">Noble Phantasm form<select className="field-input" value={servant.selectedNpId ?? ""} onChange={(event) => patch({ selectedNpId: event.target.value === "" ? undefined : Number(event.target.value) })}><option value="">Select form</option>{entry.npIds.map((id) => <option key={id} value={id}>{npOptionLabel(entry, id)}</option>)}</select></label>}
        </section>

        <section>
          <p className="form-section-label">Skills</p>
          <div className="skill-levels">{[0, 1, 2].map((index) => <label key={index}><span className="skill-orb">{index + 1}</span><span>Skill {index + 1}</span><input className="field-input" type="number" min={1} max={10} value={servant.skillLevels[index]} onChange={(event) => setSkill(index as 0 | 1 | 2, Number(event.target.value))} /></label>)}</div>
        </section>

        <section>
          <p className="form-section-label">Append skills</p>
          <div className="append-list">{[1, 2, 3].map((slot) => <label key={slot}><input type="checkbox" checked={servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined} onChange={(event) => toggleAppend(slot as 1 | 2 | 3, event.target.checked)} /><span>Append {slot}</span>{servant.appendSkillLevels[slot as 1 | 2 | 3] !== undefined && <input aria-label={`Append skill ${slot} level`} className="field-input" type="number" min={1} max={10} value={servant.appendSkillLevels[slot as 1 | 2 | 3]} onChange={(event) => patch({ appendSkillLevels: { ...servant.appendSkillLevels, [slot]: Number(event.target.value) as never } })} />}</label>)}</div>
        </section>

        <section className="form-grid form-grid--two">
          <label>ATK Fou<input className="field-input" type="number" min={0} max={2000} value={servant.fou.atk} onChange={(event) => patch({ fou: { ...servant.fou, atk: Number(event.target.value) } })} /></label>
          <label>HP Fou<input className="field-input" type="number" min={0} max={2000} value={servant.fou.hp} onChange={(event) => patch({ fou: { ...servant.fou, hp: Number(event.target.value) } })} /></label>
        </section>

        {entry.strengtheningKeys.length > 0 && <section><p className="form-section-label">Cleared strengthenings</p><div className="check-list">{entry.strengtheningKeys.map((key, index) => <label key={key}><input type="checkbox" checked={servant.unlockedStrengthenings.includes(key)} onChange={(event) => toggleStrengthening(key, event.target.checked)} />{strengtheningLabel(key, index)}</label>)}</div></section>}
      </div>
    </div>
  );
}

export default function ServantAddDialog({ profile, catalog, onChange, onSelect, onClose }: ServantAddDialogProps) {
  const [stage, setStage] = useState<"catalog" | "build">("catalog");
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [selected, setSelected] = useState<ServantCatalogEntry | undefined>();
  const [draft, setDraft] = useState<RosterProfile>(profile);
  const classes = useMemo(() => [...new Set(catalog.servants.map((entry) => entry.className ?? "Unknown class"))].sort(), [catalog.servants]);
  const results = useMemo(() => catalog.servants.filter((entry) => servantMatches(entry, query) && (classFilter === "" || entry.className === classFilter)), [catalog.servants, classFilter, query]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const choose = (entry: ServantCatalogEntry) => { setSelected(entry); setDraft(addRosterServant(profile, entry)); setStage("build"); };
  const confirm = () => { if (selected !== undefined) { onChange(draft); onSelect(selected.servantId); } onClose(); };

  return (
    <div className="dialog-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="collection-dialog" role="dialog" aria-modal="true" aria-labelledby="servant-dialog-title">
        <header className="collection-dialog__header">
          <div><p className="eyebrow">{stage === "catalog" ? "Choose · 01" : "Configure · 02"}</p><h2 id="servant-dialog-title">{stage === "catalog" ? "Add a Servant" : selected?.name}</h2><p>{stage === "catalog" ? "Browse the regional Atlas catalogue by player-facing name and class." : "Record the build you actually own."}</p></div>
          <button type="button" className="quiet-action" onClick={onClose}>Close</button>
        </header>
        <div className="collection-dialog__body">
          {stage === "catalog" ? (
            <>
              <div className="catalog-toolbar">
                <label className="search-line"><span>Search Servants</span><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name" /></label>
                <label className="select-line"><span>Class</span><select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}><option value="">All classes</option>{classes.map((className) => <option key={className} value={className}>{className}</option>)}</select></label>
              </div>
              <div className="catalog-gallery">{results.map((entry) => { const owned = profile.ownedServants[entry.servantId] !== undefined; return <button key={entry.servantId} type="button" className="catalog-portrait" onClick={() => choose(entry)}><div><Portrait src={entry.portraitUrl} name={entry.name} />{owned && <span className="owned-flag">Owned</span>}</div><strong>{entry.name}</strong><small>{entry.className ?? "Unknown class"}</small></button>; })}</div>
              {results.length === 0 && <div className="empty-state"><span className="empty-state__mark">0</span><p>No Servants match these filters.</p></div>}
            </>
          ) : selected !== undefined && <BuildStage profile={draft} entry={selected} onChange={setDraft} />}
        </div>
        {stage === "build" && <footer className="collection-dialog__footer"><button type="button" className="quiet-action" onClick={() => setStage("catalog")}>Back to catalogue</button><button type="button" className="primary-action" onClick={confirm}>Save Servant</button></footer>}
      </div>
    </div>
  );
}
