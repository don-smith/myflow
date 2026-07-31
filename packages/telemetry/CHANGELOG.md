# Changelog

All notable changes to `@myflow/telemetry` are documented here.

## [Unreleased]

### Changed

- Replaced the previous telemetry backend with Langfuse TypeScript SDK v5 and OpenTelemetry.
- Added typed Langfuse agent, chain, tool, and generation observations with token and cost metadata.
- Added Langfuse credentials, environment, and release configuration with environment-variable precedence.
- Added export-time payload masking and explicit shutdown flushing.
- Restored deterministic friction evaluation as Langfuse scores (`myflow.friction-free` and `myflow.friction.*`).
- Added offline detector/reducer APIs and retained a best-effort local session summary for Close when Langfuse is unavailable.
- Updated the evaluation runbook for Langfuse datasets, evaluators, experiments, and CI gates.

### Removed

- Removed the legacy MLflow telemetry backend, provider modules, and dependency.
