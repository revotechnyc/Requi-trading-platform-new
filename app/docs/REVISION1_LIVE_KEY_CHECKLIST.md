# Revision 1 — Live key swap checklist

After pasting real credentials into `app/.env`:

```
DATA_PROVIDER_MODE=live
MASSIVE_API_KEY=<your Massive/Polygon key>
ESTIMATES_VENDOR=factset   # or lseg | capiq
ESTIMATES_API_KEY=<vendor key>
```

Keep existing free keys: `FINNHUB_API_KEY`, `ALPHA_VANTAGE_API_KEY`, `FRED_API_KEY`, `SEC_EDGAR_USER_AGENT`.

## Smoke prompts
1. `ER AMC today`
2. `Run earnings candidate research on AAPL`
3. `Run peer read-through analysis on AAPL`
4. Paste Base Reset protocol + `on AAPL`

## Expect
- Gap register sources show Massive / estimates vendor (not only MOCK) when entitlements work.
- Classification never STRONG while critical gates unavailable.
- Calendar panel (Intelligence → Calendar) loads Finnhub day board.

## Rollback
Set `DATA_PROVIDER_MODE=mock` and `MASSIVE_API_KEY=DUMMY` / `ESTIMATES_API_KEY=DUMMY`.
