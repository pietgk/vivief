# /devac:ship - Complete Ship Flow

You are helping the user ship their changes: commit, push, and prepare a pull request.

This is the complete flow combining `/devac:commit` and `/devac:prepare-pr`.

## Steps

### 1. Run commit flow

Execute the full commit workflow:
- Check staged changes
- Analyze changes
- Draft commit message
- Check for changeset need
- Check for ADR need
- Execute commit

### 2. Push to remote

```bash
# Push current branch, setting upstream if needed
git push -u origin HEAD
```

### 3. Prepare PR description

- Gather branch and commit context
- Check for related issue
- Draft PR title and description
- Note changesets included

### 4. Summary

Provide complete shipping summary with next steps.

## Example Flow

```
User: /devac:ship

Claude: Let me help you ship these changes...

## Step 1: Commit

[Runs /devac:commit flow]

Committed: feat(cli): add watch mode (#42)
Changeset: Created (.changeset/happy-tigers-run.md)

## Step 2: Push

Pushing to origin...
Branch 42-add-watch-mode pushed to origin.

## Step 3: PR Ready

**Title:** feat(cli): add watch mode for incremental analysis (#42)

**Description:**
[PR description content]

---

To create the PR:
```bash
gh pr create --title "feat(cli): add watch mode (#42)" --body "[description]"
```

Or create manually at: https://github.com/org/repo/compare/42-add-watch-mode
```

## When to Use

Use `/devac:ship` when:
- You're ready to commit, push, and open a PR in one flow
- You want the complete guided workflow
- You're shipping a feature or fix that's complete

## Notes

- This command executes git commit and push
- Review the commit message and changeset before confirming
- The PR is not automatically created - you'll get the details to create it
