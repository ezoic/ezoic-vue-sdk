// Dev-mode detection for developer-facing warnings. Reads process.env.NODE_ENV,
// the token every major bundler (Vite/webpack/Rollup) statically replaces at the
// consumer's build time: folds to a constant false in the consumer's production
// build (warnings tree-shake away) and true in development. The SDK's own Vite
// library build leaves the token intact (verified) so the consumer's bundler
// resolves it. Matches the Vue/pinia/vue-router convention.
declare const process: { env: { NODE_ENV?: string } };

export function isDevMode(): boolean {
  return process.env.NODE_ENV !== 'production';
}
