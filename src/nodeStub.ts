/**
 * A stand-in for `node:fs` and `node:path` in the browser.
 *
 * `HospitalResident.save()` and `HospitalResident.load()` read and write
 * instance files, so `hospital-resident-matching` imports the two Node
 * built-ins at the top of the module the package entry re-exports — which a
 * browser has not got.  This app never calls either method (it parses the
 * files the user drops in, and it only needs `stableMatch()` anyway), so
 * `vite.config.ts` aliases the built-ins here; anything that does reach them
 * fails loudly rather than silently doing nothing.
 */

function unavailable(name: string): never {
  throw new Error(`${name}() needs Node.js and is not available in the browser`);
}

// node:fs
export const existsSync = (): never => unavailable("existsSync");
export const mkdirSync = (): never => unavailable("mkdirSync");
export const readFileSync = (): never => unavailable("readFileSync");
export const writeFileSync = (): never => unavailable("writeFileSync");

// node:path
export const dirname = (): never => unavailable("dirname");
