import type { MarketplaceSeed } from "./types";

export const MARKETPLACE_CATALOG: MarketplaceSeed[] = [
  {
    "slug": "scan-opening-range-breakout",
    "name": "Opening Range Breakout",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Opening Range Breakout setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Opening Range Breakout opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-vwap-reclaim",
    "name": "VWAP Reclaim",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest VWAP Reclaim setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best VWAP Reclaim opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-vwap-rejection",
    "name": "VWAP Rejection",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest VWAP Rejection setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best VWAP Rejection opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-gap-and-go",
    "name": "Gap-and-Go",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Gap-and-Go setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Gap-and-Go opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-gap-fade",
    "name": "Gap Fade",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest Gap Fade setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Gap Fade opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-first-pullback-in-trend",
    "name": "First Pullback in Trend",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest First Pullback in Trend setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best First Pullback in Trend opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-high-of-day-break",
    "name": "High-of-Day Break",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest High-of-Day Break setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best High-of-Day Break opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-low-of-day-breakdown",
    "name": "Low-of-Day Breakdown",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest Low-of-Day Breakdown setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Low-of-Day Breakdown opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-premarket-high-break",
    "name": "Premarket High Break",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Premarket High Break setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Premarket High Break opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-premarket-low-breakdown",
    "name": "Premarket Low Breakdown",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest Premarket Low Breakdown setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Premarket Low Breakdown opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-opening-drive-continuation",
    "name": "Opening Drive Continuation",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Opening Drive Continuation setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Opening Drive Continuation opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-opening-reversal",
    "name": "Opening Reversal",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Opening Reversal setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Opening Reversal opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-prior-day-high-break",
    "name": "Prior-Day High Break",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Prior-Day High Break setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Prior-Day High Break opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-prior-day-low-breakdown",
    "name": "Prior-Day Low Breakdown",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest Prior-Day Low Breakdown setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Prior-Day Low Breakdown opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-volume-expansion-breakout",
    "name": "Volume-Expansion Breakout",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Volume-Expansion Breakout setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Volume-Expansion Breakout opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-relative-strength-leader",
    "name": "Relative Strength Leader",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Relative Strength Leader setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Relative Strength Leader opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-relative-weakness-laggard",
    "name": "Relative Weakness Laggard",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Reversal",
    "description": "Scans the live market for the strongest Relative Weakness Laggard setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Identify high-quality reversal/short setups with defined invalidation and targets — and stand down when the setup is weak.",
    "tags": [
      "Reversal",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Relative Weakness Laggard opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-sector-leader-rotation",
    "name": "Sector Leader Rotation",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Relative Value",
    "description": "Scans the live market for the strongest Sector Leader Rotation setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Rank rotation and relative-value opportunities with confirmation, entry, invalidation, and targets.",
    "tags": [
      "Relative Value",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Sector Leader Rotation opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-pairs-trading",
    "name": "Pairs Trading",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Relative Value",
    "description": "Scans the live market for the strongest Pairs Trading setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Rank rotation and relative-value opportunities with confirmation, entry, invalidation, and targets.",
    "tags": [
      "Relative Value",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Pairs Trading opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-etf-component-divergence",
    "name": "ETF-Component Divergence",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Relative Value",
    "description": "Scans the live market for the strongest ETF-Component Divergence setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Rank rotation and relative-value opportunities with confirmation, entry, invalidation, and targets.",
    "tags": [
      "Relative Value",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best ETF-Component Divergence opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-intraday-mean-reversion-to-vwap",
    "name": "Intraday Mean Reversion to VWAP",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Intraday Mean Reversion to VWAP setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Intraday Mean Reversion to VWAP opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-intraday-stretch-reversion",
    "name": "Intraday Stretch Reversion",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Intraday Stretch Reversion setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Intraday Stretch Reversion opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-liquidity-sweep-reversal",
    "name": "Liquidity-Sweep Reversal",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Liquidity-Sweep Reversal setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Liquidity-Sweep Reversal opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-news-catalyst-momentum",
    "name": "News-Catalyst Momentum",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest News-Catalyst Momentum setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best News-Catalyst Momentum opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-trading-halt-resumption",
    "name": "Trading-Halt Resumption",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Momentum",
    "description": "Scans the live market for the strongest Trading-Halt Resumption setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Find and rank the strongest live momentum setups, with entry trigger, invalidation, targets, and a NO TRADE rule when nothing qualifies.",
    "tags": [
      "Momentum",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Trading-Halt Resumption opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-20-day-breakout",
    "name": "20-Day Breakout",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Swing",
    "description": "Scans the live market for the strongest 20-Day Breakout setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Surface multi-day to multi-week swing candidates with entry, stop, targets, and holding-period guidance.",
    "tags": [
      "Swing",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best 20-Day Breakout opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-50-day-moving-average-pullback",
    "name": "50-Day Moving-Average Pullback",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Swing",
    "description": "Scans the live market for the strongest 50-Day Moving-Average Pullback setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Surface multi-day to multi-week swing candidates with entry, stop, targets, and holding-period guidance.",
    "tags": [
      "Swing",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best 50-Day Moving-Average Pullback opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-base-breakout",
    "name": "Base Breakout",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Swing",
    "description": "Scans the live market for the strongest Base Breakout setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Surface multi-day to multi-week swing candidates with entry, stop, targets, and holding-period guidance.",
    "tags": [
      "Swing",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Base Breakout opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-multi-month-momentum",
    "name": "Multi-Month Momentum",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Swing",
    "description": "Scans the live market for the strongest Multi-Month Momentum setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Surface multi-day to multi-week swing candidates with entry, stop, targets, and holding-period guidance.",
    "tags": [
      "Swing",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Multi-Month Momentum opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-post-earnings-announcement-drift",
    "name": "Post-Earnings Announcement Drift",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Post-Earnings Announcement Drift setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Post-Earnings Announcement Drift opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-earnings-gap-continuation",
    "name": "Earnings Gap Continuation",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Earnings Gap Continuation setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Earnings Gap Continuation opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-earnings-gap-fade",
    "name": "Earnings Gap Fade",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Earnings Gap Fade setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Earnings Gap Fade opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-estimate-revision-momentum",
    "name": "Estimate-Revision Momentum",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Estimate-Revision Momentum setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Estimate-Revision Momentum opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-guidance-inflection-trade",
    "name": "Guidance-Inflection Trade",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Guidance-Inflection Trade setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Guidance-Inflection Trade opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-earnings-quality-long",
    "name": "Earnings Quality Long",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Earnings Quality Long setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Earnings Quality Long opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-deteriorating-earnings-quality-short",
    "name": "Deteriorating Earnings Quality Short",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Deteriorating Earnings Quality Short setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Deteriorating Earnings Quality Short opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-pre-earnings-expectations-setup",
    "name": "Pre-Earnings Expectations Setup",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Pre-Earnings Expectations Setup setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Pre-Earnings Expectations Setup opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-long-put-on-confirmed-breakdown",
    "name": "Long Put on Confirmed Breakdown",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Long Put on Confirmed Breakdown setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Long Put on Confirmed Breakdown opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-put-debit-spread",
    "name": "Put Debit Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Put Debit Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Put Debit Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-call-debit-spread",
    "name": "Call Debit Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Call Debit Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Call Debit Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-protective-put",
    "name": "Protective Put",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Protective Put setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Protective Put opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-collar",
    "name": "Collar",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Collar setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Collar opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-bear-call-spread",
    "name": "Bear Call Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Bear Call Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Bear Call Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-bull-put-spread",
    "name": "Bull Put Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Bull Put Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Bull Put Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-long-straddle",
    "name": "Long Straddle",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Long Straddle setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Long Straddle opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-long-strangle",
    "name": "Long Strangle",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Long Strangle setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Long Strangle opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-calendar-spread",
    "name": "Calendar Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest Calendar Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Calendar Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-earnings-iv-crush-defined-risk-spread",
    "name": "Earnings IV-Crush Defined-Risk Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Earnings & Events",
    "description": "Scans the live market for the strongest Earnings IV-Crush Defined-Risk Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Work earnings and event catalysts with defined-risk plans, timing rules, and NO TRADE discipline.",
    "tags": [
      "Earnings & Events",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Earnings IV-Crush Defined-Risk Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-0dte-defined-risk-index-spread",
    "name": "0DTE Defined-Risk Index Spread",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Options",
    "price": 29,
    "category": "Options — Defined Risk",
    "description": "Scans the live market for the strongest 0DTE Defined-Risk Index Spread setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Structure defined-risk options trades with full parameter checks before any order.",
    "tags": [
      "Options — Defined Risk",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best 0DTE Defined-Risk Index Spread opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "scan-quality-value-momentum",
    "name": "Quality + Value + Momentum",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Stocks",
    "price": 29,
    "category": "Swing",
    "description": "Scans the live market for the strongest Quality + Value + Momentum setups — no ticker required. Searches only liquid candidates and ranks the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality.",
    "outcome": "Surface multi-day to multi-week swing candidates with entry, stop, targets, and holding-period guidance.",
    "tags": [
      "Swing",
      "Live scan",
      "No-trade rule"
    ],
    "prompt": "Scan the live U.S. market now for the best Quality + Value + Momentum opportunity; do not require a ticker from me. Search only liquid candidates and rank the top 3 using current price action, volume, spread/liquidity, catalyst, market and sector confirmation, and setup quality. For the best candidate return ticker, live price, why it qualifies, entry trigger, invalidation/stop area, target 1, target 2, expected holding period, confidence score, and NO TRADE if nothing clearly qualifies."
  },
  {
    "slug": "research-whole-market-opportunity-scan",
    "name": "Whole-Market Opportunity Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans the live U.S. market across liquid large-, mid-, and small-cap stocks for the best opportunities right now. Ranks the top 10 as day trade, swing, long, short, earnings, or options research candidates and explain each in beginner-friendly language.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan the live U.S. market across liquid large-, mid-, and small-cap stocks for the best opportunities right now. Rank the top 10 as day trade, swing, long, short, earnings, or options research candidates and explain each in beginner-friendly language."
  },
  {
    "slug": "research-market-regime-scanner",
    "name": "Market Regime Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Uses live major index ETFs, the volatility index, Treasury yields, breadth, and sector performance to classify today's market as trending, choppy, risk-on, risk-off, or mixed.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Using live SPY, QQQ, IWM, VIX, Treasury yields, breadth, and sector performance, classify today's market as trending, choppy, risk-on, risk-off, or mixed. State which strategy families fit and which should be avoided."
  },
  {
    "slug": "research-best-longs-now",
    "name": "Best Longs Now",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans the live market for the five strongest long candidates using relative strength, volume, revisions, catalysts, and price structure. Ranks them and returns NO TRADE if none has a clear edge.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research",
      "No-trade rule"
    ],
    "prompt": "Scan the live market for the five strongest long candidates using relative strength, volume, revisions, catalysts, and price structure. Rank them and return NO TRADE if none has a clear edge."
  },
  {
    "slug": "research-best-shorts-now",
    "name": "Best Shorts Now",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans the live market for five liquid short candidates with relative weakness, negative revisions, breakdown structure, or credible negative catalysts. Flags squeeze and borrow risk.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan the live market for five liquid short candidates with relative weakness, negative revisions, breakdown structure, or credible negative catalysts. Flag squeeze and borrow risk."
  },
  {
    "slug": "research-best-day-trades-now",
    "name": "Best Day Trades Now",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans live U.S. equities for the five best intraday setups using relative volume, catalysts, VWAP, opening range, spreads, and market direction. Exclude thin or erratic names.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan live U.S. equities for the five best intraday setups using relative volume, catalysts, VWAP, opening range, spreads, and market direction. Exclude thin or erratic names."
  },
  {
    "slug": "research-best-swing-trades-now",
    "name": "Best Swing Trades Now",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for the five best 2-20 day swing candidates using trend, breakout structure, revisions, catalysts, and relative strength. Include entry zone and invalidation.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for the five best 2-20 day swing candidates using trend, breakout structure, revisions, catalysts, and relative strength. Include entry zone and invalidation."
  },
  {
    "slug": "research-upcoming-earnings-scan",
    "name": "Upcoming Earnings Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans liquid companies reporting earnings in the next 10 trading days and rank the best research opportunities. Compares revisions, historical surprises, implied move, valuation, guidance trend, and options liquidity.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan liquid companies reporting earnings in the next 10 trading days and rank the best research opportunities. Compare revisions, historical surprises, implied move, valuation, guidance trend, and options liquidity."
  },
  {
    "slug": "research-recent-earnings-winners",
    "name": "Recent Earnings Winners",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans companies that reported earnings in the last five trading days and find the strongest high-quality reactions. Separate durable repricing from one-day spikes.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan companies that reported earnings in the last five trading days and find the strongest high-quality reactions. Separate durable repricing from one-day spikes."
  },
  {
    "slug": "research-recent-earnings-losers",
    "name": "Recent Earnings Losers",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans companies that reported earnings in the last five trading days and find the weakest reactions with deteriorating guidance, margins, revisions, or price structure.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan companies that reported earnings in the last five trading days and find the weakest reactions with deteriorating guidance, margins, revisions, or price structure."
  },
  {
    "slug": "research-earnings-reversal-scan",
    "name": "Earnings Reversal Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find recent earnings reports where the stock moved opposite the headline beat or miss. Explains what the market is reacting to and whether the move is still actionable.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find recent earnings reports where the stock moved opposite the headline beat or miss. Explain what the market is reacting to and whether the move is still actionable."
  },
  {
    "slug": "research-gap-scanner",
    "name": "Gap Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans today's market for meaningful gaps caused by earnings, guidance, M&A;, regulatory news, contracts, or macro developments. Ranks continuation and fade candidates separately.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan today's market for meaningful gaps caused by earnings, guidance, M&A;, regulatory news, contracts, or macro developments. Rank continuation and fade candidates separately."
  },
  {
    "slug": "research-relative-volume-scanner",
    "name": "Relative Volume Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find liquid U.S. stocks trading at unusually high relative volume today. Identifies the catalyst and whether the volume supports continuation, reversal, or no trade.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research",
      "No-trade rule"
    ],
    "prompt": "Find liquid U.S. stocks trading at unusually high relative volume today. Identify the catalyst and whether the volume supports continuation, reversal, or no trade."
  },
  {
    "slug": "research-sector-leadership-scanner",
    "name": "Sector Leadership Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Ranks major U.S. sectors using live relative strength, breadth, volume, and revision trends. Identifies the top three liquid stocks inside the strongest sectors.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Rank major U.S. sectors using live relative strength, breadth, volume, and revision trends. Identify the top three liquid stocks inside the strongest sectors."
  },
  {
    "slug": "research-sector-weakness-scanner",
    "name": "Sector Weakness Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Ranks the weakest U.S. sectors using live relative strength, breadth, volume, and revisions. Identifies the weakest liquid stocks while flagging squeeze risk.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Rank the weakest U.S. sectors using live relative strength, breadth, volume, and revisions. Identify the weakest liquid stocks while flagging squeeze risk."
  },
  {
    "slug": "research-breadth-divergence-check",
    "name": "Breadth Divergence Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Compares major indexes with advance/decline data, new highs/lows, equal-weight performance, and sector breadth. Explains whether participation confirms or contradicts the index move.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Compare major indexes with advance/decline data, new highs/lows, equal-weight performance, and sector breadth. Explain whether participation confirms or contradicts the index move."
  },
  {
    "slug": "research-volatility-regime-scan",
    "name": "Volatility Regime Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Assesses live the volatility index, realized volatility, intraday ranges, and options-implied volatility. Explains which strategies currently fit the volatility environment.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Assess live VIX, realized volatility, intraday ranges, and options-implied volatility. Explain which strategies currently fit the volatility environment."
  },
  {
    "slug": "research-unusual-options-activity",
    "name": "Unusual Options Activity",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans liquid option chains for unusual volume or open-interest changes, but do not treat them as automatic signals. Ranks only cases where options activity aligns with verified news and underlying price action.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan liquid option chains for unusual volume or open-interest changes, but do not treat them as automatic signals. Rank only cases where options activity aligns with verified news and underlying price action."
  },
  {
    "slug": "research-implied-move-vs-history",
    "name": "Implied Move vs History",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "For upcoming liquid earnings names, compare options-implied move with historical realized earnings moves. Ranks cases where implied volatility looks unusually high or low.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "For upcoming liquid earnings names, compare options-implied move with historical realized earnings moves. Rank cases where implied volatility looks unusually high or low."
  },
  {
    "slug": "research-put-opportunity-scan",
    "name": "Put Opportunity Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for liquid bearish setups where puts or put debit spreads could express the thesis with defined risk. Compares technical downside, fundamentals, implied volatility, theta, and liquidity.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for liquid bearish setups where puts or put debit spreads could express the thesis with defined risk. Compare technical downside, fundamentals, implied volatility, theta, and liquidity."
  },
  {
    "slug": "research-call-spread-opportunity-scan",
    "name": "Call-Spread Opportunity Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for liquid bullish setups where a call debit spread could provide defined risk. Ranks candidates using trend, catalyst, implied volatility, liquidity, and upside target.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for liquid bullish setups where a call debit spread could provide defined risk. Rank candidates using trend, catalyst, implied volatility, liquidity, and upside target."
  },
  {
    "slug": "research-breakout-scanner",
    "name": "Breakout Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans live equities for stocks near 20-day, 50-day, or multi-month breakout levels. Ranks by consolidation quality, relative strength, volume, catalyst, and overhead resistance.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan live equities for stocks near 20-day, 50-day, or multi-month breakout levels. Rank by consolidation quality, relative strength, volume, catalyst, and overhead resistance."
  },
  {
    "slug": "research-pullback-scanner",
    "name": "Pullback Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find strong stocks pulling back toward meaningful support or moving averages without obvious fundamental deterioration. Separate constructive pullbacks from possible trend failures.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find strong stocks pulling back toward meaningful support or moving averages without obvious fundamental deterioration. Separate constructive pullbacks from possible trend failures."
  },
  {
    "slug": "research-mean-reversion-scanner",
    "name": "Mean-Reversion Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find highly liquid stocks stretched far from short-term fair value without a fresh catalyst that justifies the move. Ranks only setups with reversal confirmation.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find highly liquid stocks stretched far from short-term fair value without a fresh catalyst that justifies the move. Rank only setups with reversal confirmation."
  },
  {
    "slug": "research-momentum-leader-scanner",
    "name": "Momentum Leader Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Ranks liquid equities by 1-day, 5-day, 20-day, 3-month, and 6-month relative strength. Identifies leaders where fundamentals and revisions support the trend.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Rank liquid equities by 1-day, 5-day, 20-day, 3-month, and 6-month relative strength. Identify leaders where fundamentals and revisions support the trend."
  },
  {
    "slug": "research-momentum-breakdown-scanner",
    "name": "Momentum Breakdown Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find former market leaders losing relative strength, breaking support, or receiving negative revisions. Ranks names transitioning from leadership to distribution.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find former market leaders losing relative strength, breaking support, or receiving negative revisions. Rank names transitioning from leadership to distribution."
  },
  {
    "slug": "research-upward-revision-scanner",
    "name": "Upward Revision Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for liquid companies with broad upward EPS and revenue revisions over the last 30 and 90 days. Ranks by revision strength, price confirmation, valuation, and catalyst.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for liquid companies with broad upward EPS and revenue revisions over the last 30 and 90 days. Rank by revision strength, price confirmation, valuation, and catalyst."
  },
  {
    "slug": "research-downward-revision-scanner",
    "name": "Downward Revision Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for companies with broad downward EPS and revenue revisions over the last 30 and 90 days. Ranks by deterioration while noting squeeze or turnaround risks.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for companies with broad downward EPS and revenue revisions over the last 30 and 90 days. Rank by deterioration while noting squeeze or turnaround risks."
  },
  {
    "slug": "research-guidance-raise-scanner",
    "name": "Guidance Raise Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies that materially raised forward guidance recently. Compares the new outlook with prior guidance, consensus, stock reaction, and follow-on analyst revisions.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies that materially raised forward guidance recently. Compare the new outlook with prior guidance, consensus, stock reaction, and follow-on analyst revisions."
  },
  {
    "slug": "research-guidance-cut-scanner",
    "name": "Guidance Cut Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies that materially cut forward guidance recently. Ranks by severity, balance-sheet vulnerability, valuation, and whether price already absorbed the bad news.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies that materially cut forward guidance recently. Rank by severity, balance-sheet vulnerability, valuation, and whether price already absorbed the bad news."
  },
  {
    "slug": "research-free-cash-flow-inflection",
    "name": "Free-Cash-Flow Inflection",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for companies moving from negative toward positive free cash flow or accelerating FCF margins. Verifies whether the improvement is operational rather than temporary.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for companies moving from negative toward positive free cash flow or accelerating FCF margins. Verify whether the improvement is operational rather than temporary."
  },
  {
    "slug": "research-margin-expansion-scanner",
    "name": "Margin Expansion Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies with meaningful gross or operating margin expansion. Ranks by durability, pricing power, revenue trend, revisions, and valuation.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies with meaningful gross or operating margin expansion. Rank by durability, pricing power, revenue trend, revisions, and valuation."
  },
  {
    "slug": "research-margin-compression-scanner",
    "name": "Margin Compression Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies with persistent gross or operating margin compression. Ranks the most vulnerable names and explain whether the deterioration appears cyclical, structural, or temporary.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies with persistent gross or operating margin compression. Rank the most vulnerable names and explain whether the deterioration appears cyclical, structural, or temporary."
  },
  {
    "slug": "research-revenue-acceleration-scanner",
    "name": "Revenue Acceleration Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for companies with accelerating sequential and year-over-year revenue growth. Ranks by quality of growth, margins, cash flow, and revisions.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for companies with accelerating sequential and year-over-year revenue growth. Rank by quality of growth, margins, cash flow, and revisions."
  },
  {
    "slug": "research-revenue-deceleration-scanner",
    "name": "Revenue Deceleration Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies with persistent revenue deceleration and weakening forward estimates. Ranks by downside risk and identify any credible turnaround catalyst.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies with persistent revenue deceleration and weakening forward estimates. Rank by downside risk and identify any credible turnaround catalyst."
  },
  {
    "slug": "research-balance-sheet-strength",
    "name": "Balance-Sheet Strength",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find liquid companies with strong net cash, low leverage, healthy interest coverage, and consistent free cash flow. Ranks those that also have improving momentum and expectations.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find liquid companies with strong net cash, low leverage, healthy interest coverage, and consistent free cash flow. Rank those that also have improving momentum and expectations."
  },
  {
    "slug": "research-balance-sheet-stress",
    "name": "Balance-Sheet Stress",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find liquid companies with leverage, refinancing, covenant, cash burn, or working-capital stress. Ranks by severity and identify upcoming risk events.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find liquid companies with leverage, refinancing, covenant, cash burn, or working-capital stress. Rank by severity and identify upcoming risk events."
  },
  {
    "slug": "research-quality-compounders",
    "name": "Quality Compounders",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for profitable companies with durable margins, strong returns on capital, low leverage, recurring cash flow, and positive revisions. Ranks the best longer-term candidates.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for profitable companies with durable margins, strong returns on capital, low leverage, recurring cash flow, and positive revisions. Rank the best longer-term candidates."
  },
  {
    "slug": "research-value-with-catalyst",
    "name": "Value with Catalyst",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find inexpensive liquid stocks with a specific catalyst that could close the valuation gap. Exclude obvious value traps with deteriorating earnings or leverage.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find inexpensive liquid stocks with a specific catalyst that could close the valuation gap. Exclude obvious value traps with deteriorating earnings or leverage."
  },
  {
    "slug": "research-insider-buying-scanner",
    "name": "Insider Buying Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find recent meaningful open-market insider purchases in liquid U.S. companies. Ranks only those where valuation, fundamentals, and price structure support the signal.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find recent meaningful open-market insider purchases in liquid U.S. companies. Rank only those where valuation, fundamentals, and price structure support the signal."
  },
  {
    "slug": "research-buyback-support-scanner",
    "name": "Buyback Support Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Find companies with active repurchase programs, strong free cash flow, and valuations where buybacks may be accretive. Distinguish authorization from actual repurchases.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Find companies with active repurchase programs, strong free cash flow, and valuations where buybacks may be accretive. Distinguish authorization from actual repurchases."
  },
  {
    "slug": "research-short-interest-map",
    "name": "Short-Interest Map",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Ranks liquid stocks by short interest, days-to-cover, borrow pressure, catalyst risk, and recent price strength. Separate squeeze setups from fundamentally weak companies.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Rank liquid stocks by short interest, days-to-cover, borrow pressure, catalyst risk, and recent price strength. Separate squeeze setups from fundamentally weak companies."
  },
  {
    "slug": "research-institutional-accumulation-research",
    "name": "Institutional Accumulation Research",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for liquid stocks showing sustained volume accumulation, relative strength, improving fundamentals, and rising institutional ownership where filings confirm it. Do not infer institutional buying from one large print.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for liquid stocks showing sustained volume accumulation, relative strength, improving fundamentals, and rising institutional ownership where filings confirm it. Do not infer institutional buying from one large print."
  },
  {
    "slug": "research-institutional-distribution-research",
    "name": "Institutional Distribution Research",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans for liquid stocks showing repeated high-volume declines, relative weakness, deteriorating fundamentals, and ownership reductions where filings support it.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan for liquid stocks showing repeated high-volume declines, relative weakness, deteriorating fundamentals, and ownership reductions where filings support it."
  },
  {
    "slug": "research-macro-catalyst-map",
    "name": "Macro Catalyst Map",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Lists the next major scheduled macro events capable of moving U.S. equities, rates, the dollar, and volatility. Explains which sectors and strategy types are most sensitive.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "List the next major scheduled macro events capable of moving U.S. equities, rates, the dollar, and volatility. Explain which sectors and strategy types are most sensitive."
  },
  {
    "slug": "research-rate-sensitivity-scan",
    "name": "Rate-Sensitivity Scan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Ranks sectors and liquid stocks by recent sensitivity to Treasury yields and real rates. Identifies unusual divergences from their normal rate relationship.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Rank sectors and liquid stocks by recent sensitivity to Treasury yields and real rates. Identify unusual divergences from their normal rate relationship."
  },
  {
    "slug": "research-index-leadership-check",
    "name": "Index Leadership Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Compares major index ETFs, major index ETFs, major index ETFs, and major index ETFs using live trend, breadth, volatility, and relative strength. Explains which leads, which lags, and what that says about risk appetite.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Compare SPY, QQQ, DIA, and IWM using live trend, breadth, volatility, and relative strength. Explain which leads, which lags, and what that says about risk appetite."
  },
  {
    "slug": "research-cross-asset-futures-check",
    "name": "Cross-Asset Futures Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans major U.S. equity-index futures, Treasury futures, crude oil, gold, and the dollar for dominant signals. Translate the result into likely sector tailwinds and headwinds.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan major U.S. equity-index futures, Treasury futures, crude oil, gold, and the dollar for dominant signals. Translate the result into likely sector tailwinds and headwinds."
  },
  {
    "slug": "research-market-risk-dashboard",
    "name": "Market Risk Dashboard",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Builds a live market risk dashboard using volatility, breadth, rates, credit, liquidity, positioning proxies, and scheduled catalysts. Ranks the five largest risks by probability and severity.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Build a live market risk dashboard using volatility, breadth, rates, credit, liquidity, positioning proxies, and scheduled catalysts. Rank the five largest risks by probability and severity."
  },
  {
    "slug": "research-no-trade-scanner",
    "name": "No-Trade Scanner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Searches the live market for clear opportunities but actively look for reasons not to trade: poor liquidity, conflicting signals, extreme spreads, event risk, or weak reward-to-risk.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research",
      "No-trade rule"
    ],
    "prompt": "Search the live market for clear opportunities but actively look for reasons not to trade: poor liquidity, conflicting signals, extreme spreads, event risk, or weak reward-to-risk. Return NO TRADE when no clean setup exists."
  },
  {
    "slug": "research-best-opportunity-right-now",
    "name": "Best Opportunity Right Now",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Market Research",
    "description": "Scans the live market across long, short, day trade, swing, earnings, relative-value, and defined-risk options setups. Select the top three only after comparing catalyst quality, liquidity, edge, invalidation clarity, and downside risk.",
    "outcome": "Produce a sourced, timestamped research readout with verifiable facts and an explicit verdict.",
    "tags": [
      "Market Research",
      "Live research"
    ],
    "prompt": "Scan the live market across long, short, day trade, swing, earnings, relative-value, and defined-risk options setups. Select the top three only after comparing catalyst quality, liquidity, edge, invalidation clarity, and downside risk."
  },
  {
    "slug": "exec-beginner-trade-plan",
    "name": "Beginner Trade Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: use live price and liquidity to create a beginner-friendly hypothetical trade plan. Gives entry trigger, preferred order type, stop/invalidation, targets, holding period, maximum-risk example, and a NO TRADE condition.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "For [TICKER], use live price and liquidity to create a beginner-friendly hypothetical trade plan. Give entry trigger, preferred order type, stop/invalidation, targets, holding period, maximum-risk example, and a NO TRADE condition."
  },
  {
    "slug": "exec-buy-entry-planner",
    "name": "Buy Entry Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: identify support, breakout trigger, VWAP/major moving-average context, and liquidity. Gives a preferred entry zone and explain whether a limit order, stop entry, or waiting for confirmation is more appropriate.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], identify support, breakout trigger, VWAP/major moving-average context, and liquidity. Give a preferred entry zone and explain whether a limit order, stop entry, or waiting for confirmation is more appropriate."
  },
  {
    "slug": "exec-short-entry-planner",
    "name": "Short Entry Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: identify breakdown trigger, resistance, VWAP context, liquidity, short interest, and squeeze risk. Gives a hypothetical short entry, invalidation, targets, and NO TRADE condition.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "For [TICKER], identify breakdown trigger, resistance, VWAP context, liquidity, short interest, and squeeze risk. Give a hypothetical short entry, invalidation, targets, and NO TRADE condition."
  },
  {
    "slug": "exec-market-vs-limit-order",
    "name": "Market vs Limit Order",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: compare current spread, liquidity, volatility, and urgency. Explains whether market or limit execution better fits the setup and the trade-off involved.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], compare current spread, liquidity, volatility, and urgency. Explain whether market or limit execution better fits the setup and the trade-off involved."
  },
  {
    "slug": "exec-stop-loss-placement",
    "name": "Stop-Loss Placement",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: place a hypothetical protective stop using market structure rather than an arbitrary percentage. Uses support/resistance, ATR, VWAP, swing levels, and thesis invalidation.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], place a hypothetical protective stop using market structure rather than an arbitrary percentage. Use support/resistance, ATR, VWAP, swing levels, and thesis invalidation."
  },
  {
    "slug": "exec-trailing-stop-planner",
    "name": "Trailing Stop Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: determine whether a trailing stop is appropriate after the trade becomes profitable. Compares percentage, dollar, ATR-based, and structure-based trailing methods.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], determine whether a trailing stop is appropriate after the trade becomes profitable. Compare percentage, dollar, ATR-based, and structure-based trailing methods."
  },
  {
    "slug": "exec-stop-vs-stop-limit",
    "name": "Stop vs Stop-Limit",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: compare a stop and stop-limit order using current liquidity and volatility. Explains execution-price risk and non-fill risk without implying either guarantees an exit.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], compare a stop and stop-limit order using current liquidity and volatility. Explain execution-price risk and non-fill risk without implying either guarantees an exit."
  },
  {
    "slug": "exec-profit-target-planner",
    "name": "Profit Target Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: identify logical first and second profit targets using support/resistance, ATR, prior highs/lows, and reward-to-risk. Explains a possible partial-profit plan.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], identify logical first and second profit targets using support/resistance, ATR, prior highs/lows, and reward-to-risk. Explain a possible partial-profit plan."
  },
  {
    "slug": "exec-break-even-stop-planner",
    "name": "Break-Even Stop Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: determine when moving a stop to break-even would protect capital without choking off normal price movement. Base the answer on structure and volatility.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], determine when moving a stop to break-even would protect capital without choking off normal price movement. Base the answer on structure and volatility."
  },
  {
    "slug": "exec-scale-in-planner",
    "name": "Scale-In Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: create a hypothetical two- or three-step entry plan only if the setup remains valid. Defines maximum total risk before the first entry.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], create a hypothetical two- or three-step entry plan only if the setup remains valid. Define maximum total risk before the first entry."
  },
  {
    "slug": "exec-scale-out-planner",
    "name": "Scale-Out Planner",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: create a hypothetical partial-profit plan using target 1, target 2, and a trailing remainder. Explains the trade-off between locking gains and limiting upside.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], create a hypothetical partial-profit plan using target 1, target 2, and a trailing remainder. Explain the trade-off between locking gains and limiting upside."
  },
  {
    "slug": "exec-position-size-calculator",
    "name": "Position-Size Calculator",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: calculate hypothetical size using account size [ACCOUNT], maximum risk [RISK%], entry, and stop. Show dollar risk before share or contract quantity.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], calculate hypothetical size using account size [ACCOUNT], maximum risk [RISK%], entry, and stop. Show dollar risk before share or contract quantity."
  },
  {
    "slug": "exec-fixed-dollar-risk",
    "name": "Fixed-Dollar Risk",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: build a plan where maximum planned loss is no more than [$RISK]. Calculates quantity from the entry-to-stop distance.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], build a plan where maximum planned loss is no more than [$RISK]. Calculate quantity from the entry-to-stop distance."
  },
  {
    "slug": "exec-percentage-risk-plan",
    "name": "Percentage-Risk Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: create a hypothetical trade using a maximum loss of [RISK%] of account equity. Reject the trade if required size or liquidity is impractical.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], create a hypothetical trade using a maximum loss of [RISK%] of account equity. Reject the trade if required size or liquidity is impractical."
  },
  {
    "slug": "exec-atr-stop-plan",
    "name": "ATR Stop Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: calculate current ATR and compare 1.0x, 1.5x, and 2.0x ATR stops. Show how each changes position size and noise tolerance.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], calculate current ATR and compare 1.0x, 1.5x, and 2.0x ATR stops. Show how each changes position size and noise tolerance."
  },
  {
    "slug": "exec-structure-stop-plan",
    "name": "Structure Stop Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: use the nearest meaningful swing, support/resistance, VWAP, or breakout level as invalidation. Explains why that level matters.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], use the nearest meaningful swing, support/resistance, VWAP, or breakout level as invalidation. Explain why that level matters."
  },
  {
    "slug": "exec-time-stop",
    "name": "Time Stop",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: define how long the trade should be allowed to work before lack of progress becomes an exit signal. Uses strategy type, catalyst, and normal behavior.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], define how long the trade should be allowed to work before lack of progress becomes an exit signal. Use strategy type, catalyst, and normal behavior."
  },
  {
    "slug": "exec-opening-range-execution",
    "name": "Opening Range Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live opening-range candidate, wait for the range to form and define trigger, stop, target, order type, and maximum chase distance. Returns NO TRADE without confirmation.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "For the best live opening-range candidate, wait for the range to form and define trigger, stop, target, order type, and maximum chase distance. Return NO TRADE without confirmation."
  },
  {
    "slug": "exec-vwap-reclaim-execution",
    "name": "VWAP Reclaim Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live VWAP-reclaim candidate, identify confirmation, entry, invalidation, targets, and when a trailing stop becomes appropriate.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live VWAP-reclaim candidate, identify confirmation, entry, invalidation, targets, and when a trailing stop becomes appropriate."
  },
  {
    "slug": "exec-vwap-rejection-execution",
    "name": "VWAP Rejection Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live VWAP-rejection candidate, identify rejection trigger, short-entry zone, invalidation, targets, and squeeze risk.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live VWAP-rejection candidate, identify rejection trigger, short-entry zone, invalidation, targets, and squeeze risk."
  },
  {
    "slug": "exec-gap-and-go-execution",
    "name": "Gap-and-Go Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For today's best gap-and-go candidate, use opening structure to set trigger, maximum chase distance, invalidation, and targets. Reject excessive spread or volatility.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For today's best gap-and-go candidate, use opening structure to set trigger, maximum chase distance, invalidation, and targets. Reject excessive spread or volatility."
  },
  {
    "slug": "exec-gap-fade-execution",
    "name": "Gap-Fade Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For today's best gap-fade candidate, require evidence the gap is failing. Defines reversal trigger, stop beyond the failed extreme, and gap-fill targets.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For today's best gap-fade candidate, require evidence the gap is failing. Define reversal trigger, stop beyond the failed extreme, and gap-fill targets."
  },
  {
    "slug": "exec-breakout-execution",
    "name": "Breakout Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live breakout candidate, define breakout level, acceptable entry range, confirmation volume, stop, and targets. Reject an overextended entry.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live breakout candidate, define breakout level, acceptable entry range, confirmation volume, stop, and targets. Reject an overextended entry."
  },
  {
    "slug": "exec-pullback-execution",
    "name": "Pullback Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live pullback candidate, define support zone, reversal confirmation, stop, and target back toward prior highs. Do not buy merely because a moving average was touched.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live pullback candidate, define support zone, reversal confirmation, stop, and target back toward prior highs. Do not buy merely because a moving average was touched."
  },
  {
    "slug": "exec-momentum-execution",
    "name": "Momentum Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live momentum candidate, require price, volume, market, and sector confirmation. Defines stop, targets, and trailing rule after the trade earns room.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live momentum candidate, require price, volume, market, and sector confirmation. Define stop, targets, and trailing rule after the trade earns room."
  },
  {
    "slug": "exec-mean-reversion-execution",
    "name": "Mean-Reversion Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live mean-reversion candidate, require exhaustion and reversal confirmation. Sets stop beyond the extreme and target VWAP or another fair-value reference.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live mean-reversion candidate, require exhaustion and reversal confirmation. Set stop beyond the extreme and target VWAP or another fair-value reference."
  },
  {
    "slug": "exec-swing-entry-execution",
    "name": "Swing Entry Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best live 2-20 day swing candidate, identify entry zone, daily invalidation, targets, overnight/event risk, and whether limit entry is preferable to chasing.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best live 2-20 day swing candidate, identify entry zone, daily invalidation, targets, overnight/event risk, and whether limit entry is preferable to chasing."
  },
  {
    "slug": "exec-earnings-continuation-execution",
    "name": "Earnings Continuation Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For the best recent earnings continuation candidate, use the earnings-day range, gap levels, volume, and revisions to define entry and invalidation. Include overnight gap risk.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For the best recent earnings continuation candidate, use the earnings-day range, gap levels, volume, and revisions to define entry and invalidation. Include overnight gap risk."
  },
  {
    "slug": "exec-pre-earnings-risk-plan",
    "name": "Pre-Earnings Risk Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: before earnings, compare staying out, reducing size, hedging, or using a defined-risk option structure. Quantify maximum loss for any proposed exposure.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER] before earnings, compare staying out, reducing size, hedging, or using a defined-risk option structure. Quantify maximum loss for any proposed exposure."
  },
  {
    "slug": "exec-post-earnings-entry-plan",
    "name": "Post-Earnings Entry Plan",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: after earnings, wait for the reaction and identify whether the gap is being accepted or rejected. Builds around price structure rather than the headline alone.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER] after earnings, wait for the reaction and identify whether the gap is being accepted or rejected. Build around price structure rather than the headline alone."
  },
  {
    "slug": "exec-long-put-execution",
    "name": "Long Put Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: compare a long put with shorting the stock. Show strike/expiration logic, premium at risk, breakeven, theta/IV considerations, and maximum loss.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], compare a long put with shorting the stock. Show strike/expiration logic, premium at risk, breakeven, theta/IV considerations, and maximum loss."
  },
  {
    "slug": "exec-put-debit-spread-execution",
    "name": "Put Debit Spread Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: construct a hypothetical put debit spread around a defined downside target. Show strikes, expiration, debit, max loss, max gain, breakeven, and liquidity.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], construct a hypothetical put debit spread around a defined downside target. Show strikes, expiration, debit, max loss, max gain, breakeven, and liquidity."
  },
  {
    "slug": "exec-call-debit-spread-execution",
    "name": "Call Debit Spread Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: construct a hypothetical call debit spread around a defined upside target. Show strikes, expiration, debit, max loss, max gain, breakeven, and liquidity.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], construct a hypothetical call debit spread around a defined upside target. Show strikes, expiration, debit, max loss, max gain, breakeven, and liquidity."
  },
  {
    "slug": "exec-protective-put-execution",
    "name": "Protective Put Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For an existing your chosen symbol position, compare protective-put strikes and expirations. Explains protection level, premium cost, and when the hedge should be removed.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For an existing [TICKER] position, compare protective-put strikes and expirations. Explain protection level, premium cost, and when the hedge should be removed."
  },
  {
    "slug": "exec-collar-execution",
    "name": "Collar Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For an existing your chosen symbol position, construct a hypothetical collar. Show downside floor, upside cap, net premium, expiration, and assignment considerations.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For an existing [TICKER] position, construct a hypothetical collar. Show downside floor, upside cap, net premium, expiration, and assignment considerations."
  },
  {
    "slug": "exec-bull-put-spread-execution",
    "name": "Bull Put Spread Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: build a hypothetical defined-risk bull put spread only if support and trend are favorable. Show max loss, max gain, breakeven, and invalidation.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], build a hypothetical defined-risk bull put spread only if support and trend are favorable. Show max loss, max gain, breakeven, and invalidation."
  },
  {
    "slug": "exec-bear-call-spread-execution",
    "name": "Bear Call Spread Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: build a hypothetical defined-risk bear call spread only if resistance and bearish/neutral structure support it. Show max loss, max gain, breakeven, and invalidation.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], build a hypothetical defined-risk bear call spread only if resistance and bearish/neutral structure support it. Show max loss, max gain, breakeven, and invalidation."
  },
  {
    "slug": "exec-straddle-execution-check",
    "name": "Straddle Execution Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: compare implied move with a realistic event-move estimate before considering a long straddle. Show total premium, breakevens, and IV-crush risk.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], compare implied move with a realistic event-move estimate before considering a long straddle. Show total premium, breakevens, and IV-crush risk."
  },
  {
    "slug": "exec-strangle-execution-check",
    "name": "Strangle Execution Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: evaluate whether a long strangle is justified by expected movement. Show strikes, total premium, breakevens, liquidity, theta, and required move.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], evaluate whether a long strangle is justified by expected movement. Show strikes, total premium, breakevens, liquidity, theta, and required move."
  },
  {
    "slug": "exec-calendar-spread-execution",
    "name": "Calendar Spread Execution",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: create a hypothetical calendar spread only if price and volatility term structure fit. Explains ideal price path, maximum debit, volatility risk, and exit timing.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], create a hypothetical calendar spread only if price and volatility term structure fit. Explain ideal price path, maximum debit, volatility risk, and exit timing."
  },
  {
    "slug": "exec-0dte-safety-check",
    "name": "0DTE Safety Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Options",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For a highly liquid index or ETF only, evaluate a 0DTE defined-risk trade and cap maximum loss before choosing strikes. Reject it for a beginner if gamma, spread, news risk, or precision is excessive.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For a highly liquid index or ETF only, evaluate a 0DTE defined-risk trade and cap maximum loss before choosing strikes. Reject it for a beginner if gamma, spread, news risk, or precision is excessive."
  },
  {
    "slug": "exec-trade-confirmation-checklist",
    "name": "Trade Confirmation Checklist",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: check catalyst, liquidity, spread, trend, volume, market direction, sector direction, and reward-to-risk before entry. Returns PASS, WAIT, or NO TRADE.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "For [TICKER], check catalyst, liquidity, spread, trend, volume, market direction, sector direction, and reward-to-risk before entry. Return PASS, WAIT, or NO TRADE."
  },
  {
    "slug": "exec-pre-order-final-check",
    "name": "Pre-Order Final Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Immediately before a hypothetical order in your chosen symbol, refresh live price, spread, news, halt status, and key levels. Cancel the setup if price moved beyond the plan or the thesis changed.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "Immediately before a hypothetical order in [TICKER], refresh live price, spread, news, halt status, and key levels. Cancel the setup if price moved beyond the plan or the thesis changed."
  },
  {
    "slug": "exec-chase-prevention",
    "name": "Chase Prevention",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: calculate how far current price has moved beyond the ideal entry using percentage and ATR. If too extended, return WAIT instead of worsening the entry.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], calculate how far current price has moved beyond the ideal entry using percentage and ATR. If too extended, return WAIT instead of worsening the entry."
  },
  {
    "slug": "exec-slippage-check",
    "name": "Slippage Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Works on your chosen symbol: determine whether current bid-ask spread and normal volume make the proposed size practical. Reject the setup if slippage materially damages reward-to-risk.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For [TICKER], determine whether current bid-ask spread and normal volume make the proposed size practical. Reject the setup if slippage materially damages reward-to-risk."
  },
  {
    "slug": "exec-news-risk-check",
    "name": "News Risk Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Before executing your chosen symbol, scan for breaking company, sector, regulatory, macro, earnings, offering, or halt-related news. State whether it confirms, weakens, or cancels the setup.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "Before executing [TICKER], scan for breaking company, sector, regulatory, macro, earnings, offering, or halt-related news. State whether it confirms, weakens, or cancels the setup."
  },
  {
    "slug": "exec-market-alignment-check",
    "name": "Market Alignment Check",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "Before executing your chosen symbol, compare the trade direction with major index ETFs/major index ETFs, sector ETF, breadth, and volatility. Explains whether alignment strengthens the setup or argues for no trade.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "Before executing [TICKER], compare the trade direction with SPY/QQQ, sector ETF, breadth, and volatility. Explain whether alignment strengthens the setup or argues for no trade."
  },
  {
    "slug": "exec-exit-decision-prompt",
    "name": "Exit Decision Prompt",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For an open hypothetical your chosen symbol trade, refresh live price and decide whether the original thesis remains intact. Chooses HOLD, REDUCE, EXIT, or TRAIL with evidence.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For an open hypothetical [TICKER] trade, refresh live price and decide whether the original thesis remains intact. Choose HOLD, REDUCE, EXIT, or TRAIL with evidence."
  },
  {
    "slug": "exec-trailing-winner-prompt",
    "name": "Trailing Winner Prompt",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For a profitable your chosen symbol trade, compare original stop, break-even, ATR trail, swing-level trail, and partial profits. Chooses the method that preserves normal price movement.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution"
    ],
    "prompt": "For a profitable [TICKER] trade, compare original stop, break-even, ATR trail, swing-level trail, and partial profits. Choose the method that preserves normal price movement."
  },
  {
    "slug": "exec-end-of-day-decision",
    "name": "End-of-Day Decision",
    "author": "RTI",
    "kind": "AI Prompt",
    "asset": "Stocks",
    "price": 29,
    "category": "Execution & Risk",
    "description": "For an open your chosen symbol position near the close, determine whether the strategy was intended for intraday or overnight holding. Evaluates earnings/news/calendar gap risk and choose EXIT, REDUCE, HEDGE, or HOLD.",
    "outcome": "Turn a chosen setup into a complete execution plan — entry, order type, stop logic, sizing, and final checks.",
    "tags": [
      "Execution & Risk",
      "Execution",
      "No-trade rule"
    ],
    "prompt": "For an open [TICKER] position near the close, determine whether the strategy was intended for intraday or overnight holding. Evaluate earnings/news/calendar gap risk and choose EXIT, REDUCE, HEDGE, or HOLD.  Universal AI Output Format Add this to any scan or execution prompt when you want standardized output: Return: data timestamp; market regime; strategy; ticker; live price; why it qualified; catalyst; liquidity/spread; market and sector confirmation; entry trigger; preferred order type; invalidation/stop; target 1; target 2; trailing-stop rule; expected holding period; maximum planned risk; reward-to-risk; confidence score; key risks; and final decision: TRADE CANDIDATE, WAIT, or NO TRADE. Beginner Order-Type Guardrails A limit order controls the worst acceptable price but may not fill. A stop order activates at its stop price and generally becomes a market order, so the execution price can differ. A trailing stop adjusts as price moves favorably by a set dollar or percentage amount, but normal volatility can still trigger it. A stop-limit adds price control after the trigger but can remain unfilled. Educational and research use only. These prompts organize live market research and hypothetical trade planning; they do not guarantee profits or replace independent verification or professional financial advice. Stocks, short positions, futures, options, leverage, and event-driven trading can produce substantial or total losses."
  },
  {
    "slug": "institutional-strategy-playbook",
    "name": "Institutional Quantitative Research & Strategy Playbook",
    "author": "RTI",
    "kind": "Strategy",
    "asset": "Multi-Asset",
    "price": 29,
    "category": "Research Framework",
    "description": "A comprehensive institutional-grade framework for systematic trading, portfolio construction, and capital preservation: research protocols, historical validation and backtesting standards, performance metrics, regime detection, trade management, ranking methodology, and deliverable specifications across equities, ETFs, options, and crypto markets.",
    "outcome": "Run a disciplined, evidence-first research operation with validation standards, capital-preservation rules, and portfolio-construction methods.",
    "tags": [
      "Research framework",
      "Backtesting",
      "Portfolio construction",
      "Capital preservation"
    ],
    "prompt": "R E Q U I T R A D I N G I N T E L L I G E N C E P L AT F O R M Institutional-Grade Quantitative Research & Investment Strategy Playbook A Comprehensive Framework for Systematic Trading, Portfolio Construction, and Capital Preservation Strategy Design & Research Protocols Version 1.0 | July 2026 C O N F I D E N T I A L — I N S T I T U T I O N A L U S E O N LY Table of Contents 1. Primary Objective 2. Research Sources 3. Historical Validation 4. Backtesting Standards 5. Performance Metrics 6. Cryptocurrency Research 7. Stock Market Research 8. Options & Derivatives Research 9. Regime Detection 10. Trade Management 11. Capital Preservation Protocol 12. Portfolio Construction 13. Historical Trade Analysis 14. Ranking Methodology 15. Strategy Deliverables 16. Final Report Specifications 17. Guiding Principles 1. Primary Objective 1. Primary Objective Research and identify trading and investing strategies that have demonstrated statistically significant positive expectancy over approximately the last 10 years (or the longest reliable history available for newer assets). This playbook establishes the research framework for an institutional-grade quantitative research operation functioning at the level of the world’s premier quantitative investment firms — Renaissance Technologies, Citadel, Jane Street, Two Sigma, DE Shaw, AQR, and Bridgewater Associates. The role is not to provide opinions or popular trading ideas. The role is to discover statistically validated investment and trading edges using rigorous quantitative research, historical evidence, and modern portfolio construction. Think like an elite research team whose only objective is maximizing long-term compounded wealth while minimizing the probability of permanent capital loss. 1.1 Research Coverage Universe The framework mandates research across the following asset classes and markets: Table 1: Research Coverage Universe ASSET CLASS INSTRUMENTS PRIORITY Cryptocurrency Binance spot and perpetual futures markets High U.S. Equities S&P 500 constituents, Nasdaq-100, large-cap stocks High Exchange-Traded Funds Broad market, sector, factor, and thematic ETFs High Options & Derivatives Index options, equity options, VIX products High Futures Equity index, commodity, and interest rate futures Medium Volatility Products VIX futures, VIX options, variance swaps, UVXY Medium 1.2 Return Objective The primary objective is to maximize long-term geometric (compounded) returns rather than maximizing win rate or annual return alone. Higher volatility and higher risk are acceptable only when the expected return justifies the additional risk and strict capital preservation rules are maintained. 3 2. Research Sources Capital Preservation Mandate All return-seeking activities are subordinate to the capital preservation protocol. No strategy, regardless of expected return, may violate the maximum drawdown or risk-per-trade constraints defined in Section 11. 2. Research Sources Every conclusion must be supported by evidence from high-quality, verifiable sources. The following source tiers establish the hierarchy of evidentiary authority: 2.1 Tier 1 Sources (Primary Authority) Table 2: Tier 1 Research Sources SOURCE TYPE APPLICATION Peer-Reviewed Journal of Finance, Review of Financial Studies, Factor research, market efficiency, Academic Journals Journal of Financial Economics anomaly validation SSRN Working Papers Pre-publication academic research Cutting-edge factor models, strategy preprints arXiv Quantitative Open-access academic repository Finance ML-based trading, methods NBER Working Papers National Bureau of Economic Research Macroeconomic regime analysis CFA Institute Research Professional standards body Portfolio construction, ethics, best practices 2.2 Tier 2 Sources (Supporting Evidence) Institutional whitepapers from quantitative asset managers and hedge funds Exchange research publications (CME, ICE, Binance Research, Coinbase Institute) Quantitative finance publications (Risk Magazine, Wilmott, Quantitative Finance) High-quality open-source quantitative research (verified backtests, reproducible code) Central bank working papers (Federal Reserve, ECB, BIS) 4 statistical 3. Historical Validation 2.3 Prohibited Sources Sources Rejected for Evidence The following source categories are explicitly excluded from the evidence base: YouTube content creators, social media recommendations, influencer opinions, anecdotal claims, marketing materials from brokerages, unverified backtest results without code disclosure, and any source with a conflict of interest that is not explicitly disclosed. 3. Historical Validation Every strategy must be validated across multiple market regimes. Strategies that only worked during a single favorable environment are rejected regardless of their backtested performance. 3.1 Required Market Regimes Table 3: Required Market Regime Validation Matrix REGIME SPECIFIC PERIODS (REFERENCE) CATEGORY MINIMUM PERFORMANCE THRESHOLD Bull markets S&P 500 > 200-day MA, VIX < 20 Positive alpha vs. benchmark Bear markets S&P 500 drawdown > 20%, VIX > 30 Capital preservation, limited drawdown S&P 500 within 10% of 200-day MA Positive expectancy per trade High-volatility VIX > 25, realized vol > 20% annualized Downside capture ratio < 0.8 Low-volatility VIX < 15, realized vol < 12% annualized Positive risk-adjusted return Inflationary periods CPI YoY > 4%, rising rate environment Real return > 0% Deflationary periods CPI YoY < 1%, falling rate environment Capital preservation Financial crises 2008-2009, 2020 Q1, systemic stress Drawdown < max allowed limit Crypto crashes 2018, 2022 FTX collapse, leverage Survival, reduced correlation Sideways / range- bound unwinds Recovery periods 5 12-24 months post-crisis Participation in upside 4. Backtesting Standards 3.2 Minimum Track Record Requirements Table 4: Minimum Track Record by Asset Class ASSET CLASS MINIMUM HISTORY PREFERRED HISTORY U.S. Equities 10 years (2016-2026) 20+ years including 2000-2002, 2008-2009 Cryptocurrency 2 full market cycles 2017-2026 including 2018 and 2022 crashes Options Strategies 5 years including at least 1 vol spike 10+ years including 2018, 2020, 2022 Factor Strategies 15 years 30+ years including multiple factor drawdowns 4. Backtesting Standards Every strategy submitted for consideration must meet the following rigorous backtesting standards. Curvefitted or over-optimized systems are rejected automatically. 4.1 Required Testing Methodologies Mandatory Testing Protocol TEST DESCRIPTION MINIMUM STANDARD Walk-Forward Recursive training/testing windows rolling 12+ months out-of-sample per fold Optimization through time Out-of-Sample Testing Holdout period not used in any Minimum 30% of total data optimization Rolling Validation Monte Carlo Performance stability across consecutive Sharpe ratio variance < 25% across periods windows Randomized trade sequence analysis 10,000 iterations minimum Parameter perturbation testing Strategy robust within +/- 20% of Simulation Sensitivity Analysis optimal parameters 6 5. Performance Metrics Parameter Analysis Stability Optimal parameter consistency over No dramatic shifts in optimal parameter time values 4.2 Transaction Cost Assumptions Table 5: Transaction Cost Model by Asset Class COST CRYPTOCURRENCY COMPONENT (BINANCE) Commission / Fee 0.02% - 0.10% (maker/taker) U.S. EQUITIES $0.00 OPTIONS - $0.50 $0.005/share contract - $1.25 per Bid-Ask Spread 0.01% - 0.05% (major pairs) 0.01% - 0.05% 1% - 5% of midprice Slippage (market) 0.02% - 0.10% 0.01% - 0.03% 0.5% - 2% of premium Funding (perps) 8-hour rate, historical average applied N/A N/A Total round-trip 0.08% - 0.30% 0.04% - 0.12% 3% - 15% of premium 4.3 Rejection Criteria Automatic Strategy Rejection Conditions Sharpe ratio in out-of-sample falls below 50% of in-sample Sharpe Maximum drawdown in out-of-sample exceeds 2x the in-sample maximum drawdown Strategy requires > 10 parameter optimizations to find profitable results Profit factor < 1.2 after transaction costs Less than 100 trades in the validation period (insufficient sample size) Any parameter set within +/- 20% of optimal produces negative expectancy Strategy performance concentrated in fewer than 10% of trading days 5. Performance Metrics Every strategy must be characterized by the following comprehensive set of performance and risk metrics. No single metric determines acceptance; all metrics are evaluated holistically. 7 5. Performance Metrics 5.1 Return Metrics Table 6: Return Metrics Definitions METRIC FORMULA / DEFINITION MINIMUM THRESHOLD CAGR (Ending Value / Beginning Value)^(1/years) Strategy-dependent; must exceed risk-free -1 rate Annualized Return Mean return scaled to annual frequency Positive after transaction costs Average Mean duration of open positions Reported for liquidity assessment Net Profit / Maximum Drawdown > 2.0 Holding Period Recovery Factor 5.2 Risk Metrics Table 7: Risk Metrics Definitions METRIC FORMULA / DEFINITION MAXIMUM THRESHOLD Maximum Largest peak-to-trough decline < 25% (equity), < 40% (crypto) Annual Volatility Standard deviation of returns (annualized) Strategy-dependent; must justify return Ulcer Index Sqrt(mean < 10% Drawdown of squared drawdown percentages) Skewness Third moment of return distribution Positive preferred; negative compensated Tail Risk (CVaR Average loss in worst 5% of outcomes < 3x annual volatility Probability of breaching capital floor < 1% over strategy lifetime 95%) Risk of Ruin 5.3 Risk-Adjusted Metrics Table 8: Risk-Adjusted Performance Metrics METRIC 8 FORMULA MINIMUM THRESHOLD must be 6. Cryptocurrency Research Sharpe Ratio (Return - Risk-Free Rate) / Volatility > 0.75 (after costs) Sortino Ratio (Return - Risk-Free Rate) / Downside > 1.0 Deviation Calmar Ratio CAGR / Maximum Drawdown MAR Ratio Average Annual Return > 0.5 (equity), > 0.8 (crypto) / Maximum > 0.5 Drawdown Profit Factor Gross Profit / Gross Loss > 1.3 Win Rate Winning Trades / Total Trades Not standalone criterion (Win% x Avg Win) - (Loss% x Avg Loss) > 0 (after costs) Average R-Multiple Average return per unit of risk taken > 0.5R Kelly Fraction (Win% x R - Loss%) / R Used for sizing; halved in practice (half- Expectancy per Trade Kelly) 6. Cryptocurrency Research Binance markets are researched using systematic combinations of technical, on-chain, and derivatives-based signals. Strategies are validated across at least two full crypto market cycles. 6.1 Technical Analysis Framework Table 9: Cryptocurrency Technical Indicators & Signals CATEGORY INDICATORS APPLICATION Trend Following Moving Averages (EMA 20/50/200) Directional bias, golden/death cross Donchian Channels Breakout entries, channel width for volatility ADX (Average Directional Index) Trend strength filtering (> 25 = trending) RSI (Relative Strength Index) Overbought (>70) / oversold (<30) with trend context MACD Momentum shifts, signal line crossovers Cross-Sectional Momentum Relative ranking of crypto universe Momentum 9 6. Cryptocurrency Research Mean Reversion Volatility Volume & Market Structure Bollinger Bands Mean reversion entries at 2+ standard deviations Keltner Channels Trend-following mean reversion hybrid RSI divergence Price/RSI divergence for reversal signals ATR (Average True Range) Stop-loss placement, position sizing Bollinger Band Width Volatility regime identification Volatility Expansion Breakout confirmation, entry timing VWAP / Anchored VWAP Fair value reference, institutional execution Volume Profile Support/resistance at high-volume nodes Market Profile Value area high/low for trade location Liquidity Sweeps Stop-run detection, reversal entry triggers 6.2 Derivatives & Funding Metrics Table 10: Derivatives-Based Signals METRIC SIGNAL INTERPRETATION FREQUENCY Funding Rates Positive = longs pay shorts (bullish exhaustion risk); Negative = shorts pay 8-hour longs (bearish exhaustion risk) Open Interest Rising OI + rising price = new longs; Rising OI + falling price = new shorts; Real-time Falling OI = position unwinding Liquidation Data Clusters of liquidations indicate leverage exhaustion and potential reversal Real-time zones Funding Rate Z- Extreme funding (> 2 std dev) signals crowded positioning and mean Score reversion opportunity Daily 6.3 On-Chain & Macro Crypto Indicators Bitcoin Dominance (BTC.D): Rising dominance = risk-off in crypto; falling = altcoin season risk-on Stablecoin Dominance / Exchange Inflows: Large stablecoin inflows to exchanges = buying pressure building Exchange Flows: Net outflows = hodling accumulation (bullish); net inflows = selling pressure (bearish) 10 7. Stock Market Research On-Chain Analytics: SOPR, MVRV ratio, realized price, long-term holder supply, whale wallet movements Machine Learning Ranking Models: Multi-factor scoring across momentum, volatility, funding, and on-chain features Adaptive Leverage: Dynamic position sizing based on realized volatility and Kelly criterion Portfolio Rotation: Systematic reallocation across crypto sub-sectors based on relative strength 7. Stock Market Research U.S. equity strategies are grounded in decades of academic factor research and validated across multiple economic cycles. 7.1 Equity Strategy Categories Table 11: Equity Strategy Framework STRATEGY DESCRIPTION KEY EVIDENCE Momentum Buying past winners, selling past losers; 3-12 Jegadeesh Investing month lookback persistent anomaly Relative Strength Cross-sectional ranking of securities by price Levy (1967); RS persists 1-12 months & Titman (1993, 2001); performance Earnings Positions based on earnings surprises and Latane & Jones (1979); post-earnings Momentum estimate revisions announcement drift Factor High Investing (Quality) Factor ROE, stable earnings, low debt, Novy-Marx (2013); quality-minus-junk consistent profitability Investing Low P/B, low P/E, high dividend yield; mean Fama-French (1992, 2015); value premium (Value) reversion in valuations with extended drawdowns Trend Following Long when price > moving average, short or Hurst, Ooi, Pedersen (2013); trend exists flat when below across asset classes Rotating into sectors with relative strength and Stivers & Sun (2010); sector momentum Sector Rotation macro tailwinds Dual Momentum 11 Absolute momentum (trend filter) + relative Antonacci (2014); reduced drawdowns, momentum (cross-sectional) improved Sharpe 8. Options & Derivatives Research Adaptive Asset Dynamic weights Allocation volatility, correlation Breadth Indicators % Market Internals Economic Regime Models of stocks based on momentum, above 200-day MA, Butler, Philbrick, Gordillo (2012) Colby (2003); breadth divergence signals advancing/declining issues trend weakness NYSE advance-decline line, up/down volume, Appel (2005); leading indicator for broad new highs/lows market Growth + inflation quadrant framework for Bridgewater All-Weather; risk parity asset allocation foundations 8. Options & Derivatives Research Options strategies are evaluated with full Greeks exposure analysis and validated across volatility regimes. Each strategy must demonstrate positive expectancy net of execution costs. 8.1 Strategy Taxonomy Table 12: Options Strategy Classification CATEGORY STRATEGIES PRIMARY GREEKS EXPOSURE Income Generation Covered Calls, Cash-Secured Puts Short gamma, positive theta, directional bias Credit Spreads (vertical, iron condor) Short gamma, positive theta, limited risk Protective Puts, Married Puts, Collars Long gamma, long vega, negative theta Zero-Cost Collars, Tail-Risk Hedging Long downside gamma, financed by short Protection Hedging / upside Directional Volatility Trading Advanced Long Calls, Long Puts, Debit Spreads Long gamma, long/short vega, delta dominant LEAPS, Synthetic Long/Short Extended duration delta exposure Calendar Spreads, Diagonal Spreads Long theta, vega dependent on term structure VIX Strategies, Volatility Arbitrage Vega dominant, gamma scalping Gamma Scalping, Dynamic Delta Gamma harvesting through rebalancing Hedging Ratio Spreads, Backspreads 12 Asymmetric gamma exposure 8. Options & Derivatives Research 8.2 Strategy Evaluation Matrix For each options strategy, the following parameters must be determined through historical analysis: Table 13: Options Strategy Evaluation Requirements PARAMETER DESCRIPTION Historical Expectancy Average P&L per trade after costs, across > 500 trades Win Rate Percentage of profitable trades Maximum Drawdown Worst peak-to-trough in strategy equity curve Greeks Exposure Profile Delta, gamma, theta, vega ranges at entry and adjustment points Best Volatility Regime VIX level and term structure shape for optimal performance Optimal IV Rank / IV Percentile Entry threshold based on relative implied volatility Optimal Days to Expiration Backtested optimal DTE for entry (e.g., 30-45 DTE for short premium) Exit Rules Profit target (% of max profit), stop-loss, time-based exit Risk-Adjusted Performance Sharpe and Sortino ratios of strategy returns Liquidity Assessment Bid-ask spread, open interest, volume at relevant strikes Execution Costs Total cost including commissions, slippage, and adverse selection 8.3 Buy vs. Sell Premium Decision Framework Buying Options vs. Selling Premium Buy options when: IV Rank < 30, positive gamma needed for asymmetric payoff, hedging existing positions, expected volatility expansion, binary events with unclear direction. Sell premium when: IV Rank > 50, theta decay accelerates in final 30 DTE, high probability of profit (e.g., credit spreads with > 60% POP), range-bound regime confirmed, sufficient margin and risk capital available. 13 9. Regime Detection 9. Regime Detection Before recommending any strategy, classify the current market regime using a multi-factor model. Recommend only strategies with demonstrated historical strength in the detected regime. 9.1 Regime Classification Framework Table 14: Multi-Factor Regime Classification Model FACTOR INDICATORS REGIME THRESHOLDS Trend Price vs. 50/200-day MA, ADX, MACD Strong trend: ADX > 25; Weak trend: ADX < 20 Volatility VIX, realized volatility, ATR High: VIX > 25; Normal: 15-25; Low: < 15 Liquidity Bid-ask spreads, volume, market depth Tightening: spreads widening > 20%; Ample: normal range Correlation Average pairwise correlation, beta High: avg corr > 0.7; Low: avg corr < 0.4 dispersion Breadth Credit Spreads % stocks above 200-day MA, advance- Strong: > 70%; Weak: < 40%; Divergence: price up, decline line breadth down HY-IG spread, CDS indices (CDX, Widening: > 500bps HY; Tight: < 350bps iTraxx) Yield Curve 10Y-2Y spread, 10Y-3M spread Inverted: negative; Flat: 0-25bps; Steep: > 100bps Economic ISM/PMI, non-farm payrolls, CPI, GDP Expansion: PMI > 55; Contraction: PMI < 50 Indicators growth 9.2 Crypto-Specific Regime Indicators Table 15: Cryptocurrency Regime Signals INDICATOR BULLISH REGIME BEARISH REGIME VIX Term Structure (equity proxy) Contango, front < back months Backwardation, vol spike Bitcoin Dominance Rising (flight to quality) Falling (alt speculation) Stablecoin Flows Large inflows to exchanges Outflows, stablecoin premium 14 10. Trade Management Open Interest (aggregate) Oi rising with price Oi rising while price falls Funding Rates Moderate positive Extremely negative or highly positive On-Chain Metrics SOPR > 1, MVRV rising, accumulation SOPR < 1, distribution, capitulation 9.3 Regime-Strategy Mapping Strategy Allocation by Regime REGIME PRIORITY STRATEGIES STRATEGIES TO AVOID Strong Bull, Low Trend following, momentum, covered calls, Short premium, mean reversion, tail Vol leveraged longs hedges Weak Bull, Rising Quality factor, dual momentum, protective High-beta momentum, naked short Vol collars puts Bear Market, High Tail-risk hedging, long volatility, cash, short Long equity beta, credit spreads, Vol trend naked longs Sideways, Low Vol Short premium, iron condors, mean reversion, Trend pairs trading directional Reduced size, wide credit spreads, volatility Directional, tight stops, full size Sideways, High Vol scalping Recovery / Early Value factor, small-cap momentum, high-beta Bull following, Defensive, long long gamma, volatility, cash- heavy 10. Trade Management Optimal trade management is as important as entry selection. Every strategy must define precise rules for entries, exits, and position adjustments. 10.1 Entry Optimization Signal confirmation: Require at least 2 independent signals for entry (e.g., price action + indicator alignment) Volume confirmation: Entry candle volume > 20-period average volume 15 10. Trade Management Timing windows: Avoid entries within 30 minutes of major economic releases Correlation check: Verify portfolio correlation impact before adding new position Regime alignment: Confirm strategy is appropriate for current detected regime 10.2 Stop-Loss Framework Table 16: Stop-Loss Methodology by Strategy Type STOP TYPE CALCULATION BEST FOR ATR-Based Stop Entry price +/- (N x ATR), N typically 2-3 Trend following, volatile markets Fixed Percentage Entry price +/- X%, X typically 1-3% Equity swing trading, crypto spot Technical Level Below support / above resistance, swing high/low Breakout strategies, pattern trading Time Stop Close position after N periods if not profitable Mean reversion, earnings plays Trailing Stop chandelier exit: Highest high - N x ATR Trend following, letting winners run 10.3 Exit & Scaling Rules Profit-Taking Protocol Partial profit-taking: Scale out 25-50% of position at first target (1R-2R), move stop to breakeven Trailing exits: Use ATR-based trailing stop for remainder of position Scale-in rules: Add to winning positions only after initial position shows profit; never average down losers Scale-out rules: Reduce position size if unrealized P&L exceeds 3% of portfolio Time-based exits: Close options positions at 21 DTE if not already closed (theta acceleration) 10.4 Dynamic Position Sizing Table 17: Position Sizing Model Parameters METHOD FORMULA RISK PER TRADE Fixed Fractional Position = (Account x Risk%) / Stop Distance 0.5% - 2% of account 16 11. Capital Preservation Protocol Half-Kelly f = (p x b - q) / (2 x b) Typically 1-3% of account Volatility Targeting Size inversely proportional to realized volatility Target portfolio vol = 10-15% Regime Adjusted Reduce size by 50% in high-vol regimes 0.25% - 1% in crisis 11. Capital Preservation Protocol Capital preservation always overrides return maximization. The following protocols are non-negotiable and enforced automatically. 11.1 Risk Limits Hierarchy Table 18: Capital Preservation Risk Limits LEVEL LIMIT ACTION TRIGGERED Per Trade Maximum 2% of portfolio at risk Position rejected if exceeds limit Daily Drawdown Maximum 3% of portfolio Close all positions, trading halt for 24 hours Weekly Drawdown Maximum 5% of portfolio Reduce position sizes by 50%, review all strategies Monthly Drawdown Maximum 8% of portfolio Emergency de-risking to 25% exposure, strategy audit Portfolio Maximum Maximum 15% peak-to-trough Full liquidation, mandatory 5-day cooling period Leverage Cap Maximum 3:1 (equity), 2:1 (crypto) Additional leverage requests rejected 11.2 Automatic De-Risking Protocols Circuit Breakers 3 consecutive losing trades: Reduce position size by 25% for next 5 trades 5 consecutive losing trades: Reduce to 50% normal size; mandatory strategy review 8 consecutive losing trades: Pause all trading in that strategy; full diagnostic required 2-sigma daily loss: Flatten 50% of exposure immediately; review correlation assumptions VIX spike > 40: Reduce equity exposure by 30%; activate hedging protocols Correlation spike: When avg pairwise correlation > 0.8, reduce position sizes by 40% 17 12. Portfolio Construction 11.3 Volatility-Adjusted Position Sizing All position sizes are adjusted for current market volatility. In high-volatility regimes, position sizes are reduced proportionally to maintain constant portfolio-level risk. Formula: Adjusted Size = Base Size x (Target Volatility / Current Realized Volatility) Where Target Volatility is typically 10-"
  }
];
