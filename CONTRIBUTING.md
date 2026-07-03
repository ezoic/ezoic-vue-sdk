# Contributing to @ezoic/vue-sdk

Contributions are welcome! This is the official Ezoic ads SDK for Vue 3, and
we'd like it to work well for everyone integrating Ezoic ads into a Vue app.

## Prerequisites

- Node.js >= 20. The repo pins a specific version in `.nvmrc` — run `nvm use`
  to switch to it automatically.
- npm (ships with Node).

## Getting started

```sh
npm install
npm run test:watch   # fast feedback loop while you work
```

## Scripts

| Script                  | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm run build`         | Builds the library with Vite into `dist/`.          |
| `npm test`              | Runs the Vitest suite once.                         |
| `npm run test:watch`    | Runs Vitest in watch mode.                          |
| `npm run test:coverage` | Runs the suite with coverage (`vitest --coverage`). |
| `npm run lint`          | Lints the codebase with ESLint.                     |
| `npm run lint:fix`      | Lints and autofixes what it can.                    |
| `npm run format`        | Formats the codebase with Prettier (autofixes).     |
| `npm run format:check`  | Checks formatting without writing changes.          |
| `npm run typecheck`     | Type-checks with `vue-tsc --noEmit`.                |
| `npm run prepack`       | Runs `build`; executes automatically before pack.   |

## Before you open a PR

Run the full check locally — this is exactly what CI runs, on a Node 20 and
Node 22 matrix:

```sh
npm run lint
npm run format:check
npm run typecheck
npm test
npm run build
```

All five must pass. If `format:check` fails, run `npm run format` to autofix
and re-check.

## Tests

Tests are written with [Vitest](https://vitest.dev/) and
[`@vue/test-utils`](https://test-utils.vuejs.org/). When you add or change
behavior:

- Add tests covering the new behavior, including error paths.
- Don't leave `.only` or skipped tests in a PR — CI runs the full suite.

## The demo app (`examples/`)

[`examples/`](./examples) is a standalone Vite + Vue 3 app with its own
`package.json` and lockfile. It aliases `@ezoic/vue-sdk` to the SDK's built
`dist/`, so the SDK must be built first:

```sh
npm run build                        # from the repo root — builds dist/
npm ci --prefix examples
npm run build --prefix examples
```

If you add a new public feature, add a corresponding usage example to the demo
app so it stays a complete, runnable reference.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) style
(`feat:`, `fix:`, `docs:`, `chore:`, etc.). Keep messages descriptive and
focused on what changed — no trailers.

## Reporting bugs / requesting features

Open a [GitHub issue](https://github.com/ezoic/ezoic-vue-sdk/issues) using the
bug report or feature request template.

## Code of conduct / license

This project is licensed under [MIT](./LICENSE). By contributing, you agree
that your contributions will be licensed under the same terms.
