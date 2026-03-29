## Additional requirement: Polish the Explanation section

Please also improve the **Explanation** output panel — both the backend logic that builds it and the frontend rendering. Here is exactly what needs to change:

---

### Backend (`converter.js`) — rewrite `buildFormattedExplanation`, `formatTernaryStructure`, `buildHumanExplanation`

The current output uses bare IF/THEN/ELSE on separate lines with flat indentation. For deeply nested expressions this is unreadable.

**Required improvements:**

**1. Indented tree format with branch connectors**

Replace the flat IF/THEN/ELSE format with a tree-connector style using `┌ condition:`, `├ if true:`, `└ if false:`, `│` continuation lines. Indent each sub-level by 2 additional spaces. Prepend `[N]` depth labels to each connector line.

Example output for `IF(A > 10, IF(B < 5, 100, 0), 99)`:
```
[1] ┌ condition: $a > 10
[1] ├ if true:
[2]   ┌ condition: $b < 5
[2]   ├ if true:  100
[2]   └ if false: 0
[1] └ if false: 99
```

**2. Inline leaf values** — when a branch is a plain value (not another ternary), print it on the same line as `if true:` / `if false:`. Only recurse to the next line when the branch is itself a nested ternary.

**3. Long condition wrapping** — if the condition string is longer than 60 characters, split it after each ` + ` (for AND/OR sum expressions) so each clause appears on its own continuation line, indented under `condition:`.

**4. Natural-language numbered step list** — replace the run-on sentence from `buildHumanExplanation` with a flat depth-first numbered step list with cross-references:
```
Step 1: Check if $a > 10
  → If YES: go to Step 2
  → If NO:  result is 99
Step 2: Check if $b < 5
  → If YES: result is 100
  → If NO:  result is 0
```

The combined explanation returned from `toPseudocode()` should be: tree section + `\n\n---\n\n` separator + step list section.

---

### Frontend (`public/app.js`) — extend `highlightExplanation`

Add highlighting for the new token types:
- `[N]` depth labels → muted grey `#64748b` (class `token-depth`)
- `condition:` prefix → amber `#f59e0b` (class `token-label-cond`)
- `if true:` prefix → green `#4ade80` (class `token-label-true`)
- `if false:` prefix → rose `#f87171` (class `token-label-false`)
- Tree connectors `┌`, `├`, `└`, `│` → slate `#475569` (class `token-connector`)
- `Step N:` → cyan `#67e8f9` (class `token-step`)
- `→ If YES:` → green `#4ade80`; `→ If NO:` → rose `#f87171`
- The `---` separator line → render as an `<hr>` styled to match the dark theme

### Frontend (`public/index.html`) — CSS additions

Add the new token classes listed above, and also:
- Increase explanation panel font-size to `15px`
- Add `max-height: 520px; overflow-y: auto` to `.explain-highlighted-code` so very long outputs don't make the page infinitely tall
- Style the `<hr>` separator: `border-color: #334155; margin: 14px 0`