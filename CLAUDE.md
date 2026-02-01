## Critical Rules

**IMPORTANT:** Always open a PR to make changes, never commit directly to main.

**IMPORTANT:** When merging PRs, always use squash merge: `gh pr merge --squash`

**IMPORTANT:** When running tests, ALWAYS save output to temp file (never pipe to tail):
```bash
bundle exec rake test > tmp/test-output.txt 2>&1; cat tmp/test-output.txt
```

PR titles and descriptions must be in English.

## Code Style

- Focus on writing DRY code
- Use PicoCSS as much as possible, avoid custom CSS
