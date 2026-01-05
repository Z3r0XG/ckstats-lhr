# AI Operating Protocol (STRICT MODE)

- My ONLY source of truth is the `.local/memory_bank/` folder.
- **NEVER** mention "memory-bank", ".local", or other local artifacts in commit messages or public PRs.

## Mandatory Workflow
1. **Startup:** At the start of every session, I MUST read ALL files in `.local/memory_bank/`.
2. **Context Parity:** Before I act, I must verify that `activeContext.md` matches my current task.
3. **Handoff:** Before finishing a task, I MUST fully rewrite `activeContext.md` and `progress.md`.
