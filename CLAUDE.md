## Critical Rules

**IMPORTANT:** Always open a PR to make changes, never commit directly to main.

**IMPORTANT:** When merging PRs, always use squash merge: `gh pr merge --squash`

**IMPORTANT:** When running tests, ALWAYS save output to temp file (never pipe to tail):
```bash
bundle exec rake test > tmp/test-output.txt 2>&1; cat tmp/test-output.txt
```

PR titles and descriptions must be in English.

## Playwright Browser Testing

To iterate quickly with browser evaluation without repeated permission prompts, write the JSON to `tmp/eval.json` and pipe it:

```bash
# Write eval JSON
echo '{"function": "() => { return document.title; }"}' > tmp/eval.json

# Execute via pipe
cat tmp/eval.json | mcp-cli call playwright/browser_evaluate -
```

For navigation:
```bash
echo '{"url": "http://localhost:4567/score.html?url=scores%2FWaltz.mxl"}' > tmp/eval.json
cat tmp/eval.json | mcp-cli call playwright/browser_navigate -
```

## Code Style

- Focus on writing DRY code
- Use PicoCSS as much as possible, avoid custom CSS
