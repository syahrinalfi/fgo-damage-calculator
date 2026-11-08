import { useMemo, useState } from "react";
import type { MysticCodeCatalogEntry, RosterProfile } from "fgo-damage-calculator/account";
import { filterMysticCodes } from "./mysticCodePresentation";

interface MysticCodeDirectoryProps {
  readonly entries: readonly MysticCodeCatalogEntry[];
  readonly owned: RosterProfile["mysticCodes"];
  readonly onAdd: (entry: MysticCodeCatalogEntry) => void;
  readonly onLevelChange: (entry: MysticCodeCatalogEntry, level: number) => void;
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase();
}

export default function MysticCodeDirectory({ entries, owned, onAdd, onLevelChange }: MysticCodeDirectoryProps) {
  const [query, setQuery] = useState("");
  const visibleEntries = useMemo(() => filterMysticCodes(entries, query), [entries, query]);
  const ownedById = useMemo(() => new Map(owned.map((item) => [item.mysticCodeId, item])), [owned]);

  return (
    <section aria-labelledby="mystic-code-directory-title" className="directory-page">
      <header className="directory-hero">
        <div>
          <p className="eyebrow">Master equipment · {owned.length} owned</p>
          <h1 id="mystic-code-directory-title" className="display-title">Mystic Codes</h1>
          <p className="lede">Keep the uniforms your Master can actually equip, with their current levels.</p>
        </div>
        <label className="search-line" htmlFor="mystic-code-search">
          <span>Find a Mystic Code</span>
          <input id="mystic-code-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Type a name" />
        </label>
      </header>

      {visibleEntries.length === 0 ? (
        <div role="status" className="empty-state">
          <span className="empty-state__mark">MC</span>
          <p>No Mystic Codes match “{query}”.</p>
        </div>
      ) : (
        <div className="mystic-directory">
          {visibleEntries.map((entry, index) => {
            const current = ownedById.get(entry.mysticCodeId);
            return (
              <article key={entry.mysticCodeId} className={`mystic-entry ${current === undefined ? "" : "is-owned"}`}>
                <span className="mystic-entry__index">{String(index + 1).padStart(2, "0")}</span>
                <div className="mystic-entry__monogram" aria-hidden="true">{initials(entry.name)}</div>
                <div className="mystic-entry__name">
                  <h2>{entry.name}</h2>
                  <p>{current === undefined ? "Not in your inventory" : "Available to the optimizer"}</p>
                </div>
                {current === undefined ? (
                  <button className="text-action" type="button" onClick={() => onAdd(entry)}>Add to Chaldea</button>
                ) : (
                  <label className="level-control">
                    <span>Level</span>
                    <input type="number" min={1} max={10} value={current.level} onChange={(event) => onLevelChange(entry, Number(event.target.value))} />
                    <small>/ 10</small>
                  </label>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
