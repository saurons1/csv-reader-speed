[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/saurons1/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/saurons1/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

Built for the [make.fun bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

# csv-reader-speed — a faster drop-in for csv-reader 1.0.0

A hand-rolled, dependency-free CSV parser that returns exactly csv-reader
1.0.0's answers (`{columns, rows, errors}`) for every input, including all
of its broken-row rules: stray CRs, quote junk, unterminated quotes, short
and long rows, with identical error order and line/row bookkeeping.

## Approach

The reference walks the text one character at a time. This version wins by
never doing that on the hot path:

- **Unquoted fields** are scanned with a single regex pass (`/[,\r\n]/g`)
  that stops at the first delimiter, then `slice()` the whole field at
  once — no per-character loop, no string building a character at a time.
- **Quoted fields** jump straight to the next quote with `indexOf('"')`
  and `slice()` whole segments; doubled quotes and CR/LF handling inside
  quotes only run when a quote is actually present.
- **Errors** (`stray_cr`, `quote_junk`, `unterminated_quote`,
  `short_row`, `long_row`) are emitted in exactly the reference's order,
  with the same `line` (record start line, counting line breaks inside
  quotes) and `row` values.

On the practice set (6 cases, ~10.5 MB of CSV) it answers in ~0.15 s
where the reference takes ~0.55 s on the same machine — about 3.7x
faster — while matching the reference byte-for-byte on all 6 cases and on
4000+ fuzzed broken-CSV inputs.

## Files

- `solve.js` — the parser: `run(input)` returns csv-reader's answer.
- `main.ts` — the harness driver: reads `/input/cases.json`, writes
  `/output/answers.json`.
