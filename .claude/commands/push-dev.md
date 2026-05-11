# Git Push + PR (Developer — No Auto-Merge)

Stage all changes, commit, push, and open a PR for Architect review.
Do NOT merge — the Architect reviews and merges as part of the CO (Close-Out) step.

## Steps

Execute in order, stopping and reporting if any step fails.

### 1. Check git status
Run `git status` and `git diff --stat`.
If clean working tree and nothing staged: report "Nothing to push — working tree is clean." and stop.

### 2. Confirm VR has passed
Check if any stories in stories.md are still open (GitHub issue is open AND not verified).
Run: `gh issue list --state open --label "verified" --json number,title`
If unverified open stories exist: warn the user: "Some stories have not been verified by VR yet. Recommend running VR before creating a PR. Continue anyway? (y/n)"
If user says n: stop. If y: continue.

### 3. Determine current branch
Run `git branch --show-current`.

### 4. Create or use a feature branch
- If on `main` or `master`: generate a short kebab-case branch name describing the changes (e.g., `implement-order-sync-flow`, `fix-idempotency-key`). Run `git checkout -b <branch-name>`.
- If already on a feature branch: continue using it.

### 5. Stage all changes
Run `git add -A`.

### 6. Write and create the commit
- Inspect staged diff with `git diff --cached --stat`.
- Write a clear commit message (imperative mood, under 72 chars).
- Run:
```
git commit -m "$(cat <<'EOF'
<your message here>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### 7. Push to remote
Run `git push -u origin <branch-name>`.

### 8. Create a Pull Request (do NOT merge)
```
gh pr create --title "<commit message summary>" --body "$(cat <<'EOF'
## Summary
<bullet points describing what changed>

## Verification
- VR (dev agent verify-stories) passed — all FRs, NFRs, and ACs met
- MUnit coverage: {floor}% floor met
- Sprint issues closed on GitHub

## Review checklist for Architect CO
- [ ] Naming conventions (kebab-case flows, dot.separated properties)
- [ ] API-Led layers correct (system/process/experience per decisions.json)
- [ ] No hardcoded credentials or URLs
- [ ] DataWeave transforms in dwl/ (not inline)
- [ ] Error envelope format correct
- [ ] Idempotency TTL matches messageTtlHours from decisions.json

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
Capture and display the PR URL.

### 9. STOP — do NOT merge
Print:
```
PR created: <URL>

The Architect will review this PR as part of the CO (Close-Out) step.
Do NOT merge yourself — wait for Architect approval.

Share this PR URL with the Architect: <URL>
```

## Error handling
- If `gh` CLI is not authenticated: tell user to run `gh auth login` first.
- Never use `--force` or `--no-verify`.
- Never merge the PR — that is the Architect's responsibility.
