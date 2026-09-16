import { useEffect, useState } from "react";
import { fetchLiveRoster, type LiveRoster } from "../data/liveRoster";

export type LiveRosterState = { readonly status: "loading" } | { readonly status: "error"; readonly message: string } | { readonly status: "ready"; readonly roster: LiveRoster };

/** Fetches the demo's real Atlas Academy roster once on mount. */
export function useLiveRoster(): LiveRosterState {
  const [state, setState] = useState<LiveRosterState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetchLiveRoster()
      .then((roster) => {
        if (!cancelled) setState({ status: "ready", roster });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
