---
name: tdd
description: Use during design and planning to shape testable interfaces, seams, and verification strategy; use during implementation when a plan needs a test-first behavior cycle
---

# Test-Driven Development

TDD is a design practice with a testing side effect. A test is a small, executable design conversation: it describes the behavior a caller needs, exposes the interface and seam that behavior requires, and gives us a regression check once the design is implemented.

TDD is not the same as unit testing. Unit testing means having tests for a unit, regardless of when they were written. TDD means using a failing behavior example to design the interface and implementation before writing production code. The valuable result is a module with a small, useful interface, clear dependencies, and tests that exercise behavior rather than implementation details.

## When to use this skill

Use TDD primarily during **Design and Plan**:

- identify the public interfaces and seams for risk-bearing behavior;
- decide which dependencies should be passed in rather than constructed internally;
- choose the appropriate test level (unit, integration, contract, or end-to-end);
- turn acceptance criteria into executable examples; and
- record what is and is not covered by automated verification.

During **Implement**, follow the TDD decisions and verification map in the accepted plan. Invoke this skill again only when the plan has not specified a seam or behavior, or when implementation reveals that the planned interface is not workable. Do not reopen settled design merely to repeat the loop.

TDD may be unnecessary for throwaway prototypes, generated code, and configuration-only changes. For legacy behavior, write a characterization or regression test at the best available public seam before changing it.

When exploring a repository, read `CONTEXT.md` if it exists and respect applicable ADRs so the interface vocabulary, test locations, and dependency conventions match the codebase.

## Design the seam before the test

A **seam** is the interface where a test observes behavior without reaching inside the module. Tests and callers should cross the same seam.

Before writing a test, record and, during collaborative planning, confirm:

1. **Behavior** — what should a caller observe, using an acceptance criterion or independent example.
2. **Interface** — the smallest useful public interface that can provide that behavior.
3. **Dependencies** — what the implementation needs, and which of those should be supplied by the caller.
4. **Test level** — the cheapest level that exercises the real behavior without hiding important integration.

Use public interfaces, not private methods, internal collaborators, call counts, or side channels. If a test needs to reach inside, first ask whether the seam is in the wrong place or the module is too shallow. Use the `/codebase-design` vocabulary when the interface, depth, or seam is itself a design question.

Prefer designs that:

- accept dependencies through parameters, constructors, or factories rather than creating them internally;
- return meaningful results rather than requiring tests to observe incidental side effects;
- keep infrastructure behind an adapter at a deliberate seam; and
- expose a small, deep interface that hides implementation complexity.

A test that requires mocking an unrelated internal dependency is design feedback. Simplify the interface or move the seam before adding more test machinery.

## The red → green loop

Work in a vertical slice: one behavior, one failing test, one minimal implementation.

### 1. Red — write the behavior first

Write one clear test through the agreed public interface. Use a real example and an independent expected result. Name the behavior, not the implementation.

```typescript
test("returns the saved account by id", async () => {
  const accounts = new InMemoryAccounts();
  const service = new AccountService(accounts);

  await service.save({ id: "a-1", name: "Ada" });

  expect(await service.get("a-1")).toEqual({ id: "a-1", name: "Ada" });
});
```

### 2. Verify red — observe the right failure

Run the narrowest relevant test command. Confirm that it fails because the behavior is missing, not because of a typo, invalid setup, or broken test runner. A test that already passes is not a useful red step; revise it or choose the next missing behavior.

Do not add a separate “break it on purpose” step. The intended behavior should be absent until the implementation is written, so the first execution supplies the necessary evidence.

### 3. Green — implement only enough

Write the smallest production change that makes the failing behavior pass. Pass dependencies into the code under test. Do not add speculative options, unrelated refactors, or test-only production methods.

### 4. Verify green — run the narrow test, then the relevant suite

Confirm the new test passes, then run the affected suite and the project checks required by the plan. If a test fails, fix the implementation or revisit the design; do not weaken the test to fit the code.

### 5. Refine after green

Remove duplication and improve names only while behavior remains green. Larger architectural refactors belong in the plan or review, not hidden inside a red → green cycle. Repeat with the next behavior.

## Test doubles and infrastructure

Prefer real implementations, simple fixtures, and in-memory adapters where they make the behavior clearer. A fake is acceptable when it is a small, meaningful adapter with behavior the test genuinely needs; do not build elaborate test-only worlds.

Mocks are exceptional, not the default:

- do not mock your own modules or internal collaborators merely to isolate a unit;
- mock only a genuine system seam when using the real adapter would be unsafe, slow, nondeterministic, or outside the test's purpose;
- prefer dependency injection over patching globals or intercepting internal calls; and
- if a mock is necessary, understand the real dependency and model the complete data shape the code may consume.

Integration tests with real components are often simpler and more trustworthy than a large collection of mocks. Test the behavior of the subject, never the behavior or existence of a mock. Read [mocking.md](mocking.md) and [testing-anti-patterns.md](testing-anti-patterns.md) before introducing a double.

## Verification map: make tests visible

Do not leave test intent buried in individual test files. During Design or Plan, add a concise verification map to the stage artifact or handoff:

```markdown
## Verification Map

| Acceptance criterion | Observable behavior / seam | Test level | Test location or name | Status |
|---|---|---|---|---|
| Account can be retrieved after saving | `AccountService` public interface | integration | `account-service.test.ts`: returns the saved account | planned |

### Explicitly not tested
- Real database failover — covered by the database adapter's integration environment, not this change.
```

The map is a coverage summary, not a replacement for tests. It should make clear:

- which acceptance criteria have automated evidence;
- which test level and seam provide that evidence;
- where a reviewer can find the evidence without reading every test; and
- what is explicitly not tested, with a reason or a follow-up.

Keep the map synchronized with the plan's success criteria as slices change. At handoff, include the test commands, changed test paths, current red/green evidence, and any uncovered criteria.

## Quality gates

Before a slice is complete:

- [ ] The behavior and public seam were identified before implementation.
- [ ] The test was written before the production behavior and failed for the expected reason.
- [ ] The test asserts observable behavior with an independent expected result.
- [ ] Dependencies are injected where doing so improves the seam; no unrelated internal dependency is mocked.
- [ ] The smallest useful implementation passes the test.
- [ ] The affected suite and required project checks pass.
- [ ] The verification map records the acceptance-criterion coverage and explicit exclusions.

Do not turn these gates into a demand for one unit test per function. Choose tests for meaningful behavior and risk. A well-designed integration test can be better evidence than many isolated tests.

## References

- [tests.md](tests.md) — examples of behavior-focused tests and tautological-test traps
- [mocking.md](mocking.md) — dependency injection and system-boundary guidance
- [testing-anti-patterns.md](testing-anti-patterns.md) — mock and test-only production-code anti-patterns
