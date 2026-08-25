# Architecture assessment

Status: `in-progress`

This template records the factual checkpoint before judgment. The example system and its current call relationship are indexed as [model:el-system], [model:el-module], and [model:rel-calls].

## Scope and drivers

Use [model:scn-change] for the approved change probe. Full file coverage belongs in `evidence/inventory.md`.

## Current architecture

The current interface [model:if-core] and request flow [model:flow-request] describe the observed system.

## Intended architecture and divergences

Keep intended state separate. Record each delta with current and intent evidence, as shown by [model:div-example].

## Strengths and load-bearing decisions

Record strengths and non-risks before findings.

## Findings and trade-offs

Each finding must cite model IDs, impact, affected scenarios, trade-offs, confidence, and candidate architecture checks.

## Recommendation triage

Leave recommendations pending until the developer accepts, rejects, or defers each candidate after factual validation.

## Packet readiness

HTML is blocked until `html-design` is resolved and `packet.html` passes its `review-packet` checker.
