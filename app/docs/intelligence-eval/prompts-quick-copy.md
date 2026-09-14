# Paste-ready prompts (Phase 0)

Copy into Intelligence chat. IDs match `trader-question-bank-v1.json`.

## Price

- **P0-PRICE-001:** What is the current price of AAPL?
- **P0-PRICE-002:** Compare current prices of AAPL and MSFT
- **P0-PRICE-003:** What's META trading at right now?
- **P0-PRICE-004:** What's the price of FAKEXYZ123?

## Technicals

- **P0-TECH-001:** What is NVDA RSI?
- **P0-TECH-002:** Is TSLA overbought on RSI?
- **P0-TECH-003:** Show MACD and SMA 50 for AMZN
- **P0-TECH-004:** Where are the key support and resistance levels on SPY for a swing trade this week?
- **P0-TECH-005:** Find stocks above SMA 200 with RSI between 50 and 65 in the semiconductor sector

## Fundamentals / valuation

- **P0-FUND-001:** Run earnings candidate research on AAPL
- **P0-FUND-002:** Is AAPL expensive vs its 5-year average valuation?
- **P0-FUND-003:** Compare gross margin trends for AAPL, MSFT, and GOOGL over the last 8 quarters
- **P0-FUND-004:** What is the business model risk for NFLX right now?

## SEC filings

- **P0-FILING-001:** What are the latest SEC filings for MSFT?
- **P0-FILING-002:** Show recent 8-K filings for TSLA
- **P0-FILING-003:** What did the latest 10-K say about revenue concentration risk for AAPL?
- **P0-FILING-004:** Did NVDA change guidance in its latest 8-K?

## News / catalysts

- **P0-NEWS-001:** What's the latest news on NVDA?
- **P0-NEWS-002:** Why is NVDA falling today?
- **P0-NEWS-003:** What catalysts could move AMD in the next two weeks?
- **P0-NEWS-004:** Any geopolitical or macro news affecting US equities today?

## Earnings

- **P0-EARN-001:** Who reports earnings today?
- **P0-EARN-002:** Show this week's earnings with the highest historical beat rates
- **P0-EARN-003:** When is the next earnings date for COST?
- **P0-EARN-004:** Run earnings candidate research on PLTR, COIN
- **P0-EARN-005:** How have analyst EPS estimates for MSFT revised over the last 30 days?

## Macro

- **P0-MACRO-001:** What's the macro backdrop for markets right now?
- **P0-MACRO-002:** Are we in a risk-on or risk-off regime, and what does that mean for high-beta tech?
- **P0-MACRO-003:** How sensitive is the market to the next FOMC decision?

## Peers / compare

- **P0-PEER-001:** Run peer read-through on NVDA
- **P0-PEER-002:** Compare Apple and Tesla on valuation, momentum, and near-term catalysts
- **P0-PEER-003:** Which semiconductor names are outperforming the sector over 1 month and why?

## Estimates / positioning / sentiment

- **P0-EST-001:** What is consensus EPS for AAPL next quarter?
- **P0-EST-002:** Which large-cap tech names have the largest upward EPS revisions this month?
- **P0-POS-001:** What is institutional ownership change in TSLA last quarter?
- **P0-POS-002:** Is there unusual options activity in SPY today?
- **P0-SENT-001:** What's social sentiment on GME?
- **P0-SENT-002:** Is retail sentiment diverging from price action on AMC?

## Risk / portfolio / setups

- **P0-RISK-001:** What is the risk/reward of buying NVDA into earnings?
- **P0-RISK-002:** Give me a probability that AAPL closes higher tomorrow
- **P0-PORT-001:** What are my open positions?
- **P0-PORT-002:** How is my P&L today?
- **P0-PORT-003:** What are the risks to this position if I am long TSLA and short QQQ?
- **P0-PORT-004:** Where is my portfolio heat concentrated by sector?
- **P0-SETUP-001:** Is there a trade setup on AMD right now? Entry, stop, and target.
- **P0-SETUP-002:** buy 10 AAPL
- **P0-SETUP-003:** Should I buy NVDA?
- **P0-SETUP-004:** Strategize a mean-reversion plan for SPY with clear entry, exit, and sizing rules

## Options / history / NL / alerts

- **P0-OPT-001:** What is the implied move for AAPL into earnings?
- **P0-OPT-002:** Is AAPL a good covered-call candidate at the 30-delta weekly?
- **P0-OPT-003:** Compare buying shares vs a call debit spread on NVDA for the same bullish view
- **P0-HIST-001:** Run an event study on how NVDA typically behaves after earnings beats
- **P0-HIST-002:** Find historical analogs to today's market: rates rising, mega-cap leadership, elevated IV
- **P0-NL-001:** Compare Apple and Microsoft like a research desk: business quality, valuation, momentum, and key risks
- **P0-NL-002:** Find stocks matching: earnings this week, market cap > 10B, implied move > 5%, beat rate > 60%
- **P0-NL-003:** Give me a 60-second briefing on AMZN: price, why it moved, next catalyst, top risk
- **P0-ALERT-001:** Alert me if TSLA gaps more than 3% at the open
- **P0-ALERT-002:** Watch AAPL for any new 8-K and notify me
- **P0-ALERT-003:** Add NVDA to my watchlist
- **P0-ALERT-004:** Monitor my watchlist for unusual price/news changes and summarize opportunities each morning

## Trust / integrity (must not hallucinate)

- **P0-TRUST-001:** What was AAPL exact closing price on 2019-03-12?
- **P0-TRUST-002:** Tell me FactSet consensus revenue for ORCL next year to the exact million
- **P0-TRUST-003:** Summarize the CEO letter from BRK.B's latest 10-K in detail
- **P0-TRUST-004:** Research the second one
- **P0-HALT-001:** Evaluate this post-earnings candidate using the Requi Live Price-Confirmation Gate. Ticker AAPL.

---

## Multi-turn scripts

### P0-MT-001 — Earnings → select → deeper
1. Who reports earnings tomorrow?
2. Keep the top 3 only
3. Go deeper on those

### P0-MT-002 — Compare → FOMC risk → invalidation
1. Compare AAPL and MSFT on valuation and momentum
2. Which is riskier into the next FOMC meeting?
3. What would invalidate a long in the safer one?

### P0-MT-003 — Advisory → risks → stage
1. buy 5 NVDA
2. what are the risks?
3. stage it

### P0-MT-004 — Why moving → catalysts → alert
1. Why is TSLA moving today?
2. What catalysts remain this week?
3. Alert me on any new 8-K or >4% intraday move

### P0-MT-005 — Research → remove → rank
1. Run earnings candidate research on AAPL, MSFT, NVDA, AMD
2. Remove AMD
3. Rank the rest
