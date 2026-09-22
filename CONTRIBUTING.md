# Contributing and maintaining

This is a private client project. Contributions should preserve research integrity, citation provenance and the existing Hermes/OpenViking integration boundaries.

## Before a change

Read the [documentation index](docs/README.md), [development instructions](docs/development/README.md) and [release controls](docs/operations/dashboard-editing.md). Use the current published source as the reference; `main` is an older checkpoint at this review date.

Create a separate branch. Keep code, documentation and test changes focused on the requested behaviour. Do not commit private data, `.env` files, provider keys, chat exports, runtime databases or production fixtures.

## What a review needs

- The concrete problem and resulting behaviour.
- Relevant checks and their actual results, including limits or skipped checks.
- Database compatibility and restore considerations when applicable.
- Updated user or operations documentation for changed behaviour.

Do not claim that mocked or isolated tests are live end-to-end verification. Do not add artificial research to production without a defined cleanup scope.

## Publication

A pull request does not deploy. Coordinate any change to `satoshi-dashboard` with the host release process; the helper checks remote and ledger consistency. Do not force-push shared history to implement a rollback.

Preserve third-party attribution and existing licences. Do not add AI or Codex co-author trailers to commit messages.
