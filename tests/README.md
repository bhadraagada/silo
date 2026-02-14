# tests

This folder is reserved for repository-level integration and end-to-end tests.

Current automated tests live in package-local `tests/` folders such as:

- `packages/core/tests`

As broader E2E coverage is added (workspace lifecycle, queue transitions,
provider profile validation), place those suites here to validate behavior
across multiple packages.
