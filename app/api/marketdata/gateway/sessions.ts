import { getMarketSession } from "../session";
import type { MarketSession } from "./types";

/** Map the canonical NYSE session service onto the gateway's session enum. */
export function currentMarketSession(now = Date.now()): MarketSession {
  const s = getMarketSession(now);
  switch (s.state) {
    case "OPEN":
      return "REGULAR";
    case "PRE_MARKET":
      return "PREMARKET";
    case "AFTER_HOURS":
    case "EARLY_CLOSE_SESSION":
      return "AFTER_HOURS";
    default:
      return "CLOSED";
  }
}
