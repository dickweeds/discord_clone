---
title: 'Scrub Git History Secrets & Parameterize AWS Account ID'
slug: 'scrub-secrets-parameterize-aws'
created: '2026-03-01'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['git-filter-repo', 'github-actions', 'terraform']
files_to_modify: ['.gitignore', '.github/workflows/release.yml', 'infrastructure/main.tf', 'infrastructure/import.sh']
code_patterns: ['GitHub Actions secrets via ${{ secrets.* }}', 'Terraform variables for infrastructure config']
test_patterns: ['no automated tests — manual verification via git log and grep']
---

# Tech-Spec: Scrub Git History Secrets & Parameterize AWS Account ID

**Created:** 2026-03-01

## Overview

### Problem Statement

The repository contains secrets committed in git history (JWT keys, encryption keys, TURN secret, owner credentials in commits `b4fdb9d`, `8365a38`, `4ba38e9`, `c7a7d05`) and a hardcoded AWS account ID in the CI/CD pipeline. The `.claude/` directory may also contain plaintext credentials (`settings.local.json`). Making the repo public in its current state would expose all of these.

### Solution

Use `git filter-repo` to permanently remove secret-containing files from git history, add `.claude/` to `.gitignore`, and parameterize the S3 bucket name in `release.yml` as a GitHub Actions secret.

### Scope

**In Scope:**
- Scrub `.env` from all git history
- Add `.claude/` to `.gitignore` and remove from git tracking
- Parameterize S3 bucket name in `release.yml` → `${{ secrets.S3_BUCKET }}`
- Document the force-push and re-clone requirement

**Out of Scope:**
- Rotating the actual secret values (separate task)
- Code signing setup
- Making the repo public (manual step after this)

## Context for Development

### Codebase Patterns

- GitHub Actions secrets already used for `AWS_DEPLOY_ROLE_ARN`, `EC2_INSTANCE_ID`, `DEPLOY_WEBHOOK_URL` — established pattern
- Terraform infrastructure in `infrastructure/` directory
- `.gitignore` at repo root — currently excludes `.claude/worktrees/` but not `.claude/` itself
- `.claude/commands/` is tracked (BMAD commands — safe for public). `.claude/settings.local.json` is NOT tracked (confirmed safe)
- Solo developer — no collaborator re-clone coordination needed

### Files to Reference

| File | Line(s) | Purpose |
| ---- | ------- | ------- |
| `.gitignore` | — | Add `.claude/` exclusion (currently only `.claude/worktrees/`) |
| `.github/workflows/release.yml` | L271 | S3 upload: `s3://discord-clone-assets-966917019849/` |
| `.github/workflows/release.yml` | L307 | SSM deploy: `s3 sync s3://discord-clone-assets-966917019849/` |
| `infrastructure/main.tf` | L300 | Terraform bucket definition: `bucket = "discord-clone-assets-966917019849"` |
| `infrastructure/import.sh` | L19 | IAM OIDC ARN with account ID `966917019849` |
| `infrastructure/import.sh` | L15 | Security group ID `sg-0c28fb2d86f83421c` |

### Technical Decisions

- `git filter-repo` chosen over BFG — more precise, actively maintained, Python-based (no Java dependency)
- Parameterize full S3 bucket name as `${{ secrets.S3_BUCKET }}` in GitHub Actions
- Terraform: use `variable` block for bucket name and account ID instead of hardcoding
- `infrastructure/import.sh`: parameterize via shell variables or environment variables
- `.claude/commands/` stays tracked — these are BMAD workflow files, safe for public

## Implementation Plan

### Tasks

#### Task 1: Add `.claude/` to `.gitignore`

- [ ] Task 1.1: Update `.gitignore` to exclude `.claude/` directory
  - File: `.gitignore`
  - Action: Replace `.claude/worktrees/` with `.claude/` under the IDE section. This broader exclusion covers `settings.local.json`, worktrees, and any future local config files. The `.claude/commands/` files are already committed and tracked — gitignore only affects untracked files, so they remain in the repo.

#### Task 2: Parameterize AWS infrastructure secrets in GitHub Actions

- [ ] Task 2.1: Replace hardcoded S3 bucket name in upload step
  - File: `.github/workflows/release.yml:L271`
  - Action: Change `s3://discord-clone-assets-966917019849/` → `s3://${{ secrets.S3_BUCKET }}/`

- [ ] Task 2.2: Replace hardcoded S3 bucket name in SSM deploy step
  - File: `.github/workflows/release.yml:L307`
  - Action: Change `s3://discord-clone-assets-966917019849/` → `s3://${{ secrets.S3_BUCKET }}/`

#### Task 3: Parameterize AWS infrastructure secrets in Terraform

- [ ] Task 3.1: Add new variables for account ID and S3 bucket name
  - File: `infrastructure/variables.tf`
  - Action: Add two new variables:
    ```hcl
    variable "aws_account_id" {
      description = "AWS account ID"
      type        = string
    }

    variable "assets_bucket_name" {
      description = "S3 bucket name for download assets"
      type        = string
    }
    ```
  - Notes: No defaults — these are sensitive values provided via `*.tfvars` (already gitignored)

- [ ] Task 3.2: Replace hardcoded bucket name in S3 resource
  - File: `infrastructure/main.tf:L300`
  - Action: Change `bucket = "discord-clone-assets-966917019849"` → `bucket = var.assets_bucket_name`

#### Task 4: Parameterize `infrastructure/import.sh`

- [ ] Task 4.1: Replace hardcoded IDs with environment variables
  - File: `infrastructure/import.sh`
  - Action: Add environment variable requirements at top of script and replace hardcoded values:
    ```bash
    # Required environment variables
    : "${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID}"
    : "${EC2_INSTANCE_ID:?Set EC2_INSTANCE_ID}"
    : "${APP_SECURITY_GROUP_ID:?Set APP_SECURITY_GROUP_ID}"
    ```
  - L14: Change `"i-0c512d91b446e9e7c"` → `"$EC2_INSTANCE_ID"`
  - L15: Change `"sg-0c28fb2d86f83421c"` → `"$APP_SECURITY_GROUP_ID"`
  - L18-19: Change `"arn:aws:iam::966917019849:oidc-provider/..."` → `"arn:aws:iam::${AWS_ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com"`

#### Task 5: Scrub `.env` from git history

- [ ] Task 5.1: Run `git filter-repo` to remove `.env` from all commits
  - Action: Execute `git filter-repo --invert-paths --path .env --force`
  - Notes: This rewrites ALL commits. Must be run from a fresh clone (git filter-repo requires it). Removes `.env` from every commit in history — commits `b4fdb9d`, `8365a38`, `4ba38e9`, `c7a7d05`, `9266a16` will be rewritten.

- [ ] Task 5.2: Force push rewritten history
  - Action: `git remote add origin <repo-url>` (filter-repo removes remotes) then `git push origin --all --force` and `git push origin --tags --force`

- [ ] Task 5.3: Add GitHub Actions secrets
  - Action: Via GitHub UI or CLI, add the following repository secrets:
    - `S3_BUCKET` = `discord-clone-assets-966917019849`
    - Notes: `AWS_DEPLOY_ROLE_ARN` and `EC2_INSTANCE_ID` already exist as secrets

#### Task 6: Verify clean state

- [ ] Task 6.1: Verify `.env` is gone from history
  - Action: `git log --all --diff-filter=A -- .env` — must return empty

- [ ] Task 6.2: Verify no hardcoded AWS IDs in tracked files
  - Action: `grep -r "966917019849" .` — must return no matches in tracked files
  - Action: `grep -r "sg-0c28fb2d86f83421c" .` — must return no matches in tracked files
  - Action: `grep -r "i-0c512d91b446e9e7c" .` — must return no matches in tracked files

### Acceptance Criteria

- [ ] AC 1: Given the git history has been rewritten, when running `git log --all -- .env`, then zero results are returned
- [ ] AC 2: Given `.claude/` is in `.gitignore`, when creating any file under `.claude/` (e.g., `settings.local.json`), then `git status` does not show it as untracked
- [ ] AC 3: Given the S3 bucket name is parameterized, when searching tracked files for `966917019849`, then zero matches are found
- [ ] AC 4: Given `infrastructure/import.sh` is parameterized, when searching tracked files for `sg-0c28fb2d86f83421c` or `i-0c512d91b446e9e7c`, then zero matches are found
- [ ] AC 5: Given the Terraform variables are added, when running `terraform plan` with values provided via `*.tfvars`, then the plan succeeds with no unexpected changes
- [ ] AC 6: Given the GitHub Actions workflow uses `${{ secrets.S3_BUCKET }}`, when the release workflow runs, then S3 upload and SSM deploy steps resolve the bucket name correctly

## Additional Context

### Dependencies

- `git-filter-repo` must be installed (`pip install git-filter-repo` or `brew install git-filter-repo`)
- GitHub repo settings access to add secrets: `S3_BUCKET`, `AWS_ACCOUNT_ID`, `APP_SECURITY_GROUP_ID`
- Terraform variables file (`*.tfvars`) is already gitignored

### Testing Strategy

- No automated tests — this is infrastructure/config work
- Manual verification:
  - `git log --all --diff-filter=A -- .env` returns empty after history scrub
  - `grep -r "966917019849" .` returns no matches in tracked files after parameterization
  - `grep -r "sg-0c28fb2d86f83421c" .` returns no matches in tracked files
  - GitHub Actions workflow dry-run passes syntax validation

### Notes

- Solo developer — force push is safe, no collaborator coordination needed
- After history scrub, all local clones become invalid and must be re-cloned
- Git history commits containing `.env`: `b4fdb9d`, `8365a38`, `4ba38e9`, `c7a7d05`, `9266a16`
- `.claude/settings.local.json` confirmed NOT tracked — no action needed beyond adding `.claude/` to `.gitignore` for future safety
