---
name: grill-me
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, when a skill needs collaborative decision-making, or on any 'grill' trigger phrase.
---

# Grill me

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

**An intent question carries no recommended answer.** When the question asks what problem the user is solving, who hits it, or what success looks like, the framing is theirs to generate — offer open shapes that route the answer, never a recommendation and never a solution shape. Every other tier — scope, shape, and detail — is a proposal you make and they review, so it does carry one.

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), go and find it through the read-only exploration capability in `../myflow/references/capabilities.md` — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the answer — ask the rest of the frontier now. The _decisions_ are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

## Repository-scoped decisions

A decision tied to a repository and its workstream may sharpen domain language or deserve an architectural decision record. Use `domain-modeling` alongside the rounds when a term is contested or a boundary moves, and `design` when the settled decision qualifies for an ADR. Take the glossary, context-map, and ADR locations from the repository map that onboarding discovered; do not assume `CONTEXT.md` or `docs/adr/`.

Questioning supplements the stage artifact, it never replaces it. Record the settled scope, trade-offs, requirements, and next action in the alignment artifact even when they are neither glossary terms nor ADRs.
