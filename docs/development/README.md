# Development

[Documentation](../README.md) / Development

## Before running anything

Use a separate checkout and an isolated database. Read [Configuration](configuration.md) and [Dashboard editing](../operations/dashboard-editing.md). Production database files, the frozen research handoff, private media and service credentials are intentionally absent from this repository.

Required tools:

- Node.js 22 and npm, matching the Docker build.
- Python 3, make and a C++ compiler for native better-sqlite3 installation when needed.
- Poppler's `pdftotext` for PDF and `antiword` for DOC extraction.
- The compiled DOCX worker, built with the backend; mammoth comes from npm.

## Compile the application

From the repository root:

```bash
cd dashboard/server
npm ci
npm run typecheck
npm run build
cd ../web
npm ci
npm run typecheck
npm run build
```

The API serves the built frontend when its distribution exists. For frontend development, `npm run dev` in `dashboard/web` starts Vite on port 5184, proxying API calls to port 5183.

## Prepare an isolated runtime

Obtain an authorised, compatible test database through the maintainer. Set `CRYPTO_DB` to that test copy. Use development authentication only on a loopback-only disposable environment; never apply it to production.

Disable source processing and scheduled intelligence while preparing fixtures. Where a test needs Hermes or OpenViking, use its documented mocks or isolated services rather than live project credentials. A clone alone does not supply the data prerequisites.

From `dashboard/server`, after preparing the test environment:

```bash
HOST=127.0.0.1 PORT=5183 AUTH_MODE=development SOURCE_PROCESSING_ENABLED=false INTELLIGENCE_AUTO_REFRESH_HOURS=0 npm start
```

This command inherits the `CRYPTO_DB` you configured. Check that path before launch. API startup can apply forward schema changes, so never point an exploratory run at the only copy of production data.

## Database bootstrap is a separate operation

`server/src/build-db.mjs` verifies the private handoff manifest and constructs the migrated baseline. It can remove an existing target database. Its `--force` switch bypasses a guard; it does not prove a safe backup exists. Use this utility only with a deliberate disposable target and the verified handoff, not as the default way to upgrade a running system.

## Run relevant checks

Backend tests include API suites that expect a prepared, running server. Read their fixtures before execution. With that environment ready:

```bash
cd dashboard/server
npm test
```

The release test image uses a prepared `test-support/baseline.db` and frozen fixtures supplied by the host helper, then runs checks with networking disabled. These private fixtures are not committed, so `Dockerfile.checks` is not a standalone clean-clone test recipe.

The editor's Python boundary tests use disposable test state:

```bash
python3 -m unittest discover -s deploy/dashboard-editor -p 'test_*.py'
```

Documentation-only changes require link, content and rendering review. Do not run production imports merely to verify a README change.

## Review and publish

Work in a feature branch, document the behaviour change, run relevant checks and include a restore plan where data/schema is affected. Code review does not itself deploy the application. Publication must preserve the release helper's commit/remote/ledger checks. [Contribution workflow](../../CONTRIBUTING.md).
