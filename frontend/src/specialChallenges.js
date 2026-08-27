// Auto-discovers every file in ./special-challenges/*.jsx at build time —
// no manual import list to maintain. Each plugin file must export:
//   - a default React component (the standalone page, reachable at #hash)
//   - `meta.hash` (controls the #hash URL it's reachable at)
//   - optionally, an async `checkStatus()` function returning
//     { takenOver, flag? } — if present, any challenge whose Instructions
//     field contains [[special:<hash>]] will auto-poll it and auto-fill
//     the flag box on the normal challenge page once it succeeds.
//
// To add a new special challenge page: drop a new .jsx file in
// special-challenges/, rebuild. Nothing here or in App.jsx needs editing.

const modules = import.meta.glob("./special-challenges/*.jsx", { eager: true });

export const specialChallenges = Object.values(modules)
  .filter((m) => m.default && m.meta?.hash)
  .map((m) => ({ ...m.meta, Component: m.default, checkStatus: m.checkStatus || null }));

export function getSpecialChallengeByHash(hash) {
  return specialChallenges.find((c) => c.hash === hash) || null;
}
