---
name: manual-verification
description: Use when the feature integrates with external services (Telegram, OpenAI, GitHub, Stripe, etc.) or involves human-interactive surfaces (CLI, chat, UI) that automated tests cannot exercise. Not for purely internal refactors or library-only changes where the test suite provides full coverage.
argument-hint: "--deps [dependency-inventory]"
allowed-tools: Read, Bash(curl *), Bash(ping *), Glob, Grep
shell-timeout: 10
contract:
  produces:
    kind: artifact
    meta:
      artifactKind: manual-verification
  consumes:
    meta:
      world: working-tree
---

# Manual Verification

## Overview

Automated tests verify that code works as designed. Manual verification confirms that the feature works for a human in the real world. External services behave differently in production — network latency, auth flows, rate limits, response format drift, and human UX friction are invisible to unit tests.

## When to Use

**Use when:**
- The feature calls an external API (Telegram, OpenAI, GitHub, Stripe, etc.)
- The feature has a CLI, chat, or UI surface a human interacts with
- The feature processes human-generated input (voice, images, files)
- Automated tests mock or stub the external service
- You are about to start the `land` / closeout process

**Do NOT use for:**
- Purely internal refactors with 100% test coverage
- Library or utility changes where the test suite exercises all code paths
- Features that cannot be exercised without credentials you don't have (skip and document)

## The Process

### Step 1 — Inventory External Dependencies

Before testing, list every external service or human-visible surface the feature touches:

| Dependency | How to test | Credentials needed |
|---|---|---|
| Telegram Bot API | Send a real message, verify reply | Bot token |
| OpenAI Whisper/TTS | Send a voice message, verify transcription + audio | API key |
| CLI tool | Run the command, verify output | None |
| ... | ... | ... |

Pull this from the plan, the code, and the as-built.

### Step 2 — Prepare the Environment

- Set required env vars (tokens, API keys) in `.env` or equivalent
- Start any long-running processes (daemon, server, watcher)
- Confirm the service is reachable: `curl` a health endpoint, send a test message

### Step 3 — Define Test Scenarios

Convert the feature's acceptance criteria into concrete, executable prompts the human can follow. Each scenario should name:

1. **What the human does** (e.g. "Send a text message saying 'hello' to @my_bot")
2. **What should happen** (e.g. "The bot replies within 15 seconds")
3. **What to check in logs** (e.g. "Look for `telegram.inbound.text` and `mail.delivered`")

**Good example:**
```
Scenario: Text message via Telegram
  Human: DM @my_bot with "What's your name?"
  Expected: Agent replies with its name and role
  Logs: telegram.inbound.text → mail.delivered → mail.sent → channel.out → telegram bot reply
  Failure: Check telegram.inbound.dispatch_error, verify agent session is active
```

**Bad example:**
```
Test Telegram - should work.
```

### Step 4 — Run with the Human

Present the scenarios to the human and walk through them together:

> "Send a text message to the doc bot. I'll watch the logs and tell you what I see."

Wait for each scenario to complete before moving to the next. If a scenario fails:

1. **Check the logs** — is the inbound event reaching the gateway?
2. **Check the middleware** — is the dispatch succeeding?
3. **Check the outbound** — is the response leaving the system?
4. **Narrow the gap** — what works? What doesn't? Where in the pipeline does it break?

**REQUIRED SUB-SKILL:** Use `systematic-debugging` before proposing a fix for any verification failure.

### Step 5 — Fix and Re-test

If you find a bug during manual verification:

1. Fix the code
2. Run the automated tests (the fix must not break existing coverage)
3. Re-run the manual verification for the affected scenario
4. Check for regressions in any previously passing scenario

Do not skip re-testing after a fix. The first fix attempt is often incomplete.

### Step 6 — Sign Off

Once all scenarios pass, update the verification record:

```
Manual verification:
  Text:      doc ✅   archie ✅
  Voice:     doc ✅   archie ✅
  CLI:       n/a (Telegram-only feature)
  Signed:    <human> + <agent>
```

This sign-off is the gate before `land` / closeout can begin.

## Common Failure Modes

| Symptom | How to detect | Fix pattern |
|---|---|---|
| Service connects but HALTS after first request | Only one of N instances logs "connected"; subsequent instances never establish session | Check per-instance initialization — ensure `start()` or equivalent doesn't block the event loop |
| Inbound received, no outbound sent | Log shows `inbound.delivered` but no trace of `outbound.invoke` or response dispatch | Check `replyExpected` / equivalent flags on the inbound payload; verify handler registration covers this sender/message type |
| Outbound call succeeds but payload is rejected | API returns 4xx with type mismatch ("wrong type", "invalid format") | Verify file/resource identity types (e.g. `InputFile` vs raw `Blob` vs URL string); test with minimal payload first |
| First scenario passes, subsequent ones silently hang | N-of-N pattern: instance N works but instance N+1 shows no activity in logs | Test each route independently, not just in sequence; check per-instance initialization isolation |

## Special Cases

### No credentials available
If you cannot obtain credentials for a required external service, document the gap explicitly in the verification record. Do not skip verification silently.

| Situation | Disposition |
|---|---|
| All scenarios pass | Gate passes → proceed to land |
| Some scenarios blocked by missing credentials | Gate passes with tagged gaps → flag as retro item |
| One or more scenarios fail (bug found) | Gate blocks → fix and re-test before proceeding |

```
Manual verification (partial):
  Text:      doc ❌ (no Telegram token — skip with note)
  Voice:     n/a
  Gap:       Needs TELEGRAM_TOKEN_DOC in .env
  Disposition: Gate passes with gaps — tagged for retro
```

### Feature spans multiple external services
Test each service-to-service boundary independently first (e.g., "Telegram → dispatcher" separate from "dispatcher → agent"). Then test the full chain.

### Interactive-only features (CLI, REPL)
Provide the exact command to run and the expected output. Do not assume the human knows the CLI syntax.

## Relationship to Other Skills

This skill is part of **stage 4 (Validate & Review)** of the myflow pipeline. It runs after `validate` and `code-review` reach zero blockers, and before stage 5 (Land). It does not replace the `validate` skill — it supplements it for features with external services or human-interactive surfaces.

```
validate → code-review → manual-verification (if external deps) → land
```

**REQUIRED SUB-SKILLS:** `verification-before-completion` applies to manual steps — do not claim a manual scenario passes without having run it fresh in this session. `systematic-debugging` for any failure discovered during verification.