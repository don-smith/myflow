# Extensible content host

A content plugin should have a local implementation package and explicit capabilities. The central registry is intentional: it gives operators one discoverable list and lets startup reject duplicate IDs. Adding a plugin is expected to require registration, contract tests, and user documentation, but capability spelling and plugin kinds must remain aligned across Rust and TypeScript.

Owners: Runtime owns the Rust host. SDK owns registry contracts. Each content team owns its plugin package and docs.
