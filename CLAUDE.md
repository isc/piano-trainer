## Critical Rules

**IMPORTANT:** Always open a PR to make changes, never commit directly to main.

**IMPORTANT:** When merging PRs, always use squash merge: `gh pr merge --squash`

**IMPORTANT:** When running tests, ALWAYS save output to temp file (never pipe to tail):
```bash
bundle exec rake test > tmp/test-output.txt 2>&1; cat tmp/test-output.txt
```

PR titles and descriptions must be in English.

## Playwright Browser Testing

To iterate quickly without repeated permission prompts, write JSON to `tmp/eval.json` using the Write tool, then pipe with a constant command:

```bash
cat tmp/eval.json | mcp-cli call playwright/browser_evaluate -
cat tmp/eval.json | mcp-cli call playwright/browser_navigate -
```

The bash command stays constant - only the file content changes via Write (no permission needed).

Example JSON:
```json
{"function": "() => document.title"}
{"url": "http://localhost:4567/score.html"}
```

## Code Style

- Focus on writing DRY code
- Use PicoCSS as much as possible, avoid custom CSS
