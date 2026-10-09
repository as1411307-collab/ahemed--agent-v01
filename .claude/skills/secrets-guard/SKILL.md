---
name: secrets-guard
description: >-
  Stop API keys, tokens, passwords and .env files from ever reaching git or
  GitHub. Use before every git commit and push, when creating or editing env
  or config files, and whenever a key, token, password or credential appears
  in the conversation or in a file.
---

# Secrets guard (احمِ الأسرار)

> بالعربي: يمنع رفع أي مفتاح API أو كلمة سر على GitHub.

Secrets in this project: `ANTHROPIC_API_KEY`, `APP_TOKEN`, `EXPO_PUBLIC_APP_TOKEN`, and anything in `.env` files. CLAUDE.md: secrets come from env only, and only the `.env.example` files are committed.

## Before every commit

1. See what is staged: `git diff --cached --name-only`.
   If a `.env` file (anything other than `.env.example`), a database file (`*.db`), the `workspace/` folder, or `.playwright-cli/` output is staged, unstage it and make sure `.gitignore` covers it.
2. Scan the staged changes for secret-looking values. In PowerShell:

   ```powershell
   git diff --cached -U0 | Select-String -Pattern 'sk-ant-|sk-[A-Za-z0-9]{20,}|ghp_|github_pat_|AKIA[0-9A-Z]{16}|BEGIN [A-Z ]*PRIVATE KEY|(API_KEY|APP_TOKEN|SECRET|PASSWORD)\s*=\s*\S{8,}'
   ```

   (In bash: `git diff --cached -U0 | grep -E` with the same pattern.)
   Look at each match yourself: a reference like `process.env.APP_TOKEN` is fine; an actual value is not.
3. `.env.example` files may contain only empty values or obvious placeholders.
4. If anything real turns up: stop, don't commit, and tell Ahmed plainly what was found and in which file.

## Never

- Never write a real key into code, tests, docs, commit messages or summaries. Use placeholders like `<your-key>`.
- Never print a secret's full value back; show at most the first 4 characters.

## If a secret was already pushed

Deleting it from the file isn't enough, because it stays in git history. The real fix is to revoke and replace the key: a new Anthropic API key from the Anthropic Console, or a new `APP_TOKEN` (then update both `.env` files). Tell Ahmed this first, then clean up the file.
