# Architecture assessment evaluation

Use this reference only when changing the skill, runner, fixtures, assertions, checker behavior, or model matrix.

## RED before skill changes

A behavior-changing instruction needs a failing controlled case first. Run fixtures without discovered skills, context files, extensions, prompt templates, themes, sessions, or project trust. Retain exact responses, events, generated files, source diff, prompt hash, fixture hash, Pi version, model, reasoning level, exit status, and duration.

Do not draft a correction from hypothetical model behavior. Record the miss or rationalization that the instruction addresses.

## Controlled cases

- `dependency-semantics`: distinguish source cycles, runtime collaboration, and event coupling.
- `expected-extension`: recover a cross-language change surface, sibling inconsistency, and registry trade-off.
- `intent-language-history`: separate current and intended authority, preserve bounded-context terms, and qualify co-change history.

Baseline and candidate prompts and fixture hashes must match. Candidate adds only the explicit skill path.

## Model gaps

Preflight every configured model and credential. Record unavailable credentials, provider failures, and timeouts. Never substitute another model silently. A gap is not a pass.

## Candidate correction loop

For each candidate miss:

1. retain the transcript and failed assertion;
2. add the smallest deterministic test when the failure has a mechanical contract;
3. make the smallest instruction or checker change supported by evidence;
4. rerun the affected case;
5. rerun the full matrix;
6. preserve strengths and seeded non-risks.

Do not make a report-format assertion stand in for architecture judgment. Deterministic checks cover files, IDs, source mutation, scope coverage, references, and packet status. Human review owns false positives, trade-offs, and explanatory quality.

## Evidence retention

Raw outputs remain under the ignored workstream evaluation directory. Track only fixtures, prompts, rubric data, runner code, and deterministic tests. Never put credentials or unredacted command secrets in run metadata.

## Resonance trial

The bounded Resonance recovery trial is an integration check, not the full assessment. Use the tracked trial scope. Hash included source before and after. Stop at the recovered-model checkpoint for developer factual correction. Do not assess findings or triage recommendations in that trial.
