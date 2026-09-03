# Open questions for the site review (asked 2026-09-02)

Answer in any order; skip any and that part stays as-is.

## Titles and dates (C1)
1. Analyzer case: Senior PM or Head of Product at the time? Rough months/years?
2. Conversion case: title and date range.
3. Draw case: title and date range.
4. Backflip overall: when did the Head of Product promotion take effect, and when did you leave?

## Conversion experiment (C2)
5. What was the pre-agreed decision bar before the three-variant test ran?
6. Why a trailing-twelve-month baseline instead of the prior quarter? One sentence, or "seasonality, as written".
7. (dropped: the attribution subplot was removed from the page on 2026-09-03) Any hard sample-size target for the three-variant test?

## Team, timeline, partners (P1)
8. Analyzer: roles on it, question-to-decision duration, functions you worked with.
9. Conversion: same three.
10. Draw: same three.
11. One "what I'd do differently" per case, one sentence each.

## "Also at Backflip" strip
12. Add a strip of smaller wins on the projects page (dashboard rebuild 26 -> 19 days, WIP reduction)? Yes/no, plus numbers.

## Infrastructure
13. E1: DNS records flipped to Proxied (orange cloud) in Cloudflare yet?
14. L5: OK to create private repo `ericgabbard/site-attribution` and move `attribution/` there?

## Small leftovers, yes/no each
15. "10+ A/B tests" chip on the conversion card?
16. Widen the "AI" nav link tap target?
17. Close the blank band above the footer on contact and 404?

Site state: phase 1 + 2 committed locally (HEAD fd92a39), not pushed. Preview: python3 -m http.server 8137 in the repo root.
