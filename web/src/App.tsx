import { useLiveRoster } from "./hooks/useLiveRoster";
import { useOptimizerResults } from "./hooks/useOptimizerResults";
import { LineRow } from "./components/LineRow";

const VISIBLE_LINES = 6;

function ResultsList({ roster }: { readonly roster: Parameters<typeof useOptimizerResults>[0] }) {
  const results = useOptimizerResults(roster);
  const shown = results.slice(0, VISIBLE_LINES);

  if (shown.length === 0) {
    return <p className="text-sm text-[var(--ink-dim)]">No line clears within the demo cost budget.</p>;
  }

  return (
    <>
      <p className="mb-3 text-xs text-[var(--ink-dim)]">
        Showing top {shown.length} of {results.length} formations
      </p>
      <div className="flex flex-col gap-2">
        {shown.map((candidate, index) => (
          <LineRow key={index} candidate={candidate} rank={index + 1} />
        ))}
      </div>
    </>
  );
}

export default function App() {
  const rosterState = useLiveRoster();

  return (
    <div className="mx-auto min-h-svh max-w-3xl px-4 py-8 sm:px-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--ink)] sm:text-3xl">Optimizer Results</h1>
        <p className="mt-2 max-w-xl text-sm text-[var(--ink-dim)]">
          Ranked lines from <code className="num rounded-sm bg-[var(--ground-raised)] px-1.5 py-0.5 text-[var(--ink)]">optimizeQuest</code>. Click a line to see the turn breakdown: cards, NP
          gauge, and damage.
        </p>
        <p className="mt-3 inline-block rounded-sm border border-[var(--rule)] bg-[var(--ground-raised)] px-2.5 py-1 text-xs text-[var(--ink-dim)]">
          Real Atlas Academy servants/CEs, fetched live. Demo quest — synthetic stand-in until account/quest setup ships.
        </p>
      </header>

      {rosterState.status === "loading" && <p className="text-sm text-[var(--ink-dim)]">Loading servant roster from Atlas Academy…</p>}
      {rosterState.status === "error" && <p className="text-sm text-[var(--buster)]">Failed to load roster: {rosterState.message}</p>}
      {rosterState.status === "ready" && <ResultsList roster={rosterState.roster} />}
    </div>
  );
}
