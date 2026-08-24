# Gold Mine Decision Engine v4 — 4H technical execution

This module combines the existing macro/news bias with a programmatic 4H XAUUSD technical layer when a free market-data credential is available.

## Order-block definition used by Gold Mine

Gold Mine treats an order block as a candidate institutional reaction zone, not a guaranteed entry.

A bullish candidate requires:
1. the last bearish 4H candle before a bullish displacement;
2. the displacement closes through a prior confirmed swing high (BOS);
3. displacement body/range is meaningful relative to ATR;
4. the candidate has not subsequently been invalidated by a 4H close below its distal boundary.

A bearish candidate mirrors those rules around a bearish displacement and break of a prior swing low.

Extra confluence increases quality rather than creating a signal by itself:
- liquidity sweep before displacement;
- fair-value gap / imbalance created by displacement;
- zone location in discount for bullish setups or premium for bearish setups;
- macro direction agrees;
- DXY / yield context does not materially contradict the setup;
- no imminent medium/high-impact US event blocks execution.

## Planning levels

When live/programmatic 4H candles exist, Gold Mine may expose planning references, not automatic orders:
- candidate limit reference: midpoint of the valid order-block zone;
- invalidation reference: beyond the distal edge plus a small ATR buffer;
- TP1 / TP2 references: nearest valid opposing swing/liquidity levels;
- estimated R multiples based on those references.

If there is not enough structural room for a sensible reward/risk profile, the setup is rejected rather than forcing a target.

Gold Mine does not place broker orders.
