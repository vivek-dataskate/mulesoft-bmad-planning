# Git Auto-Push Workflow

Automate the full git workflow: stage → commit → branch → push → PR → merge → cleanup.

## Steps

Execute these steps in order, stopping and reporting if any step fails:

### 1. Check git status
Run `git status` and `git diff --stat` to understand what changed.
If there are no changes (clean working tree and nothing staged), report "Nothing to push — working tree is clean." and stop.

### 2. Determine current branch
Run `git branch --show-current` to get the current branch name.

### 3. Create or use a feature branch
- If currently on `main` or `master`: generate a short, kebab-case branch name that describes the changes (e.g., `add-user-auth`, `fix-login-bug`, `update-config`). Run `git checkout -b <branch-name>`.
- If already on a feature branch: continue using it.

### 4. Stage all changes
Run `git add -A` to stage everything.

### 5. Write and create the commit
- Inspect the staged diff with `git diff --cached --stat` to understand what changed.
- Write a clear, concise commit message (imperative mood, under 72 chars).
- Run the commit:
```
git commit -m "$(cat <<'EOF'
<your message here>

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

### 6. Push to remote
Run `git push -u origin <branch-name>`.

### 7. Create a Pull Request
Use `gh pr create` to open a PR targeting `main`:
```
gh pr create --title "<commit message summary>" --body "$(cat <<'EOF'
## Summary
<bullet points describing what changed and why>

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
Capture and display the PR URL.

### 8. Merge the Pull Request
Run `gh pr merge --merge --delete-branch` to merge and auto-delete the remote branch.
If merge fails due to conflicts or CI checks, report the error and stop — do NOT force-merge.

### 9. Switch back to main and pull
```
git checkout main
git pull origin main
```

### 10. Delete local feature branch
```
git branch -d <branch-name>
```

### 11. Report success
Print a one-line summary: what was merged, the PR URL, and confirm you're back on `main`.

## Error handling
- If `gh` CLI is not authenticated, tell the user to run `gh auth login` first.
- Never use `--force` or `--no-verify`.
- Never merge if there are unresolved conflicts.
- If any step fails, stop immediately and show the error clearly.
