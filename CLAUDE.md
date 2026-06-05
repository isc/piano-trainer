## Critical Rules

**IMPORTANT:** Always open a PR to make changes, never commit directly to main.

**IMPORTANT:** When merging PRs, always use squash merge: `gh pr merge --squash`

**IMPORTANT:** When running tests, ALWAYS save output to temp file (never pipe to tail):
```bash
bundle exec rake test > tmp/test-output.txt 2>&1; cat tmp/test-output.txt
```

PR titles and descriptions must be in English.

## Library

**IMPORTANT:** After adding or removing a score (editing `public/data/scores.json`
and the file in `public/scores/`), regenerate the fingerprints so the score is
findable by playing its opening notes on the MIDI keyboard:
```bash
ruby scripts/generate_fingerprints.rb
```
`public/data/fingerprints.json` must stay in sync with the catalog (same count).

## Playwright Browser Testing

Use the **Playwright CLI** (`@playwright/cli`, already a devDependency — binary at
`node_modules/.bin/playwright-cli`) rather than the MCP `browser_*` tools. Snapshots and
console logs are written to disk under `.playwright-cli/` instead of being streamed into
context (~4× fewer tokens), and the browser session persists between Bash commands.

Pass `-s=<session>` to keep a named, persistent session across commands:

```bash
playwright-cli -s=pt open http://localhost:4567/   # open + navigate
playwright-cli -s=pt goto http://localhost:4567/score.html
playwright-cli -s=pt snapshot                        # writes ref-annotated snapshot to disk
playwright-cli -s=pt eval "() => document.title" --raw
playwright-cli -s=pt click e15                       # interact via refs from the snapshot
playwright-cli -s=pt close
```

`--raw` prints only the result value (no status banner). Run `playwright-cli --help` for the
full command list. Interactive exploration works the same way — `snapshot` to get element
refs, then `click`/`fill`/`eval` against them.

## Code Style

- Focus on writing DRY code
- Use PicoCSS as much as possible, avoid custom CSS
