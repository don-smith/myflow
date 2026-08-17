---
name: diagnosing-bugs
description: Use when behavior is broken, failing, flaky, unexpectedly slow, or otherwise differs from its expected result, before proposing a durable fix.
---

# Diagnosing Bugs

A durable fix needs evidence: establish a feedback loop, find the source, make the smallest root-cause change, and prove the original scenario is fixed.

## When to use

Use for bugs, test/build/integration failures, flakes, and performance regressions. Use `tdd` for planned behavior or a test seam still being designed.

### Incident containment

During an active incident, a reversible, narrowly scoped containment action (rollback, failover, or feature flag) may precede diagnosis. Record its scope and risk; it is not the fix. **Before any durable code or policy change, state `Feedback loop: <command>`, run it, and capture its result.** A new retry, timeout, or policy is not a durable fix without that evidence.

## 1. Establish a feedback loop

Before theorizing or changing production code, run one agent-runnable command that distinguishes the exact symptom from success: a failing test, asserted client script, replay, minimal harness, or fuzz/differential/bisection loop. For human-only flow, adapt `scripts/hitl-loop.template.sh`.

Make it fast, deterministic, and symptom-specific. Raise a flake's reproduction rate with repetition, stress, or timing control; measure performance before changing it. Redact sensitive captures.

If no loop exists, stop durable-fix work; state attempts and ask for environment access, a redacted artifact, or temporary instrumentation.

## 2. Capture and narrow evidence

Capture the error, output, or measurement, then minimise inputs, configuration, data, and steps until they are load-bearing. Check the complete stack trace, recent changes, the data flow back to its trigger, and a comparable working path.

For multi-component systems, inspect data and configuration at boundaries until the failing component is known. Prefer a debugger; otherwise use targeted, uniquely tagged temporary logs.

## 3. Test hypotheses

List 3–5 ranked, falsifiable hypotheses; each predicts an observable result. Test one prediction and one variable at a time. A disproved hypothesis returns to evidence gathering.

For a flaky asynchronous test, wait for the observable condition, not a guessed sleep. The wait needs fresh state, a bounded timeout, and a named error; it does not replace root-cause analysis. Fixed delays are only for justified timing behavior.

**Red flags:** “add a retry then investigate,” “increase the sleep,” or “try one quick change” mean: return to the feedback loop.

## 4. Fix and verify

Turn the minimised reproducer into a regression test at a seam exercising the real bug pattern. If no such seam exists, document the architectural limitation rather than adding a misleading shallow test.

Apply one minimal change addressing the confirmed source. Run the regression test, original unminimised loop, and relevant broader checks. A failed fix returns to evidence and hypotheses. Repeated failures or a missing test seam warrant an architecture follow-up, not an automatic architectural verdict; use `improve-codebase-architecture` for a concrete deepening opportunity.

## 5. Close the investigation

Record the redacted symptom/repro, cause/evidence, regression coverage or its absence, original-scenario verification, removed diagnostics, and containment rollback or prevention follow-up. Never present a workaround as the completed fix.
