// The suite as a fresh npm tarball carries it: pack, unpack into a scratch
// directory, and run `node --test` inside the unpacked package. The
// `package.json` `files` list is the only thing that decides what ships, so a
// test that references a file outside it (as the style test once did with
// CONTRIBUTING.md) can pass in a checkout and fail only inside the tarball.
// This is that check, as a command a release run and CI both call.
//
// It runs the packed suite on Bun too: that is the runtime magpie actually
// loads plugins on, and no other job runs it against the packed artifact. A
// machine without Bun skips that half; `--require-bun` (what CI passes, where
// Bun is installed on purpose) makes a Bun that will not run an error instead
// of a silent skip.
//
//   node scripts/tarball.mjs                 # exit 0 when the packed suite passes
//   node scripts/tarball.mjs --require-bun   # …and Bun must run it too

import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { checkTargets } from "./build-native.mjs"

// The checkout this script lives in, not the caller's directory: `npm pack`
// packs the directory it runs in, and a release script is often run from
// elsewhere.
const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const requireBun = process.argv.includes("--require-bun")
// npm and tar are .cmd shims on Windows, which execFileSync only finds
// through the shell. cmd.exe receives the arguments joined, not quoted, and a
// temp directory can carry a space (a Windows profile folder commonly does),
// so an argument that needs it is quoted here. node and bun are real
// executables and run without a shell, which keeps a missing Bun an ENOENT
// (a skip) rather than a shell 127 that looks like a failing program.
const shell = process.platform === "win32"
// Every character cmd.exe acts on, not only a space: an ampersand splits the
// line into two commands (a temp path is allowed to contain one), and the
// redirection and caret characters do the same. An embedded quote is doubled,
// which is how cmd reads one inside a quoted argument.
const NEEDS_QUOTE = /[\s"&|<>^()%]/
export const quoteArg = (arg, throughShell) => (throughShell && NEEDS_QUOTE.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg)

// shellSafe refuses an argument cmd.exe would expand: %NAME% is substituted
// even inside double quotes, and there is no quoting that turns it off. A
// temp directory carrying a percent is pathological; saying so (exit 2) is
// better than packing from the wrong path or reading the wrong tarball.
export const shellSafe = (args, throughShell) => {
  if (!throughShell) return
  const bad = args.find((a) => String(a).includes("%"))
  if (bad) throw usage(`a path containing % (${bad}) cannot be passed through cmd.exe safely; set TMPDIR to a path without %`)
}

// run is execFileSync with one failure message shape, and a plain sentence
// when the program itself is missing rather than failing.
export const run = (cmd, args, { throughShell = shell, ...opts } = {}) => {
  shellSafe(args, throughShell)
  try {
    return execFileSync(cmd, args.map((a) => quoteArg(a, throughShell)), { encoding: "utf8", shell: throughShell, ...opts })
  } catch (e) {
    // Through cmd.exe a missing program is not ENOENT: cmd prints "not
    // recognized" and exits 9009 (127 from a POSIX shell), and Node throws a
    // status error. Both mean "could not run here", not "the gate ran and
    // failed", so the exit code is 2 on either platform.
    const missing = e?.code === "ENOENT" || (throughShell && (e?.status === 9009 || e?.status === 127))
    if (missing) { const miss = new Error(`${cmd} was not found in PATH; this check needs it`); miss.exitCode = 2; throw miss }
    // A program that ran and failed (npm cannot pack, tar cannot unpack) is
    // also "nothing usable came of the run" — 2 — not "the packed suite
    // failed" — 1. execFileSync reports the child's status as .status, and
    // the top-level catch used to read only .exitCode, which it never sets:
    // every environment failure came out as 1, pointing at the artifact.
    const failed = new Error(`${cmd} ${args.join(" ")} failed (exit ${e?.status ?? "unknown"})`)
    failed.exitCode = 2
    throw failed
  }
}

// usage is an argument this check does not know: exit 2, the same answer the
// catalog generator gives, so a release script cannot mistake it for "the gate
// ran and failed" (1) or "it passed" (0). A misspelt --require-bun used to be
// ignored, and the Bun half was silently skipped on a release run.
const usage = (message) => { const e = new Error(message); e.exitCode = 2; return e }

// tarballOf finds the archive a pack left in dir. A pack that exits 0 and
// writes none is not "the packed suite failed" (1): there is nothing to run,
// so it is "ask again" (2), the same answer as a missing npm.
export const tarballOf = (dir) => {
  const tgz = readdirSync(dir).find((f) => f.endsWith(".tgz"))
  if (!tgz) throw usage(`npm pack wrote no tarball into ${dir}`)
  return tgz
}

// requireNativeBin checks the packaged proxy builds against the source tree's.
// The binaries are optional — a checkout that never built them packs none, and
// the plugin falls back to fetch there — but when the source tree has them, the
// package must carry all five intact: `files` decides what ships, and a release
// whose tarball silently dropped `native/bin` would install and then quietly
// use the old fingerprint. Returns how many builds it checked (0 when the
// source tree has none).
export const requireNativeBin = (sourceRoot, unpacked) => {
  if (!existsSync(join(sourceRoot, "native", "bin"))) return 0
  const rows = checkTargets(join(unpacked, "native", "bin"))
  const bad = rows.filter((r) => r.state !== "present")
  if (bad.length) {
    throw new Error(`the tarball's native/bin is not the source tree's build: ${bad.map((r) => `${r.name} ${r.state === "missing" ? "missing" : r.reason}`).join("; ")}`)
  }
  return rows.length
}

const main = () => {
  const options = process.argv.slice(2)
  const unknown = options.filter((a) => a !== "--require-bun")
  if (unknown.length) throw usage(`unrecognized argument ${unknown.join(" ")} (only --require-bun is accepted)`)
  const root = mkdtempSync(join(tmpdir(), "codar-tarball-"))
  try {
    // `prepublishOnly` runs this script inside `npm publish`, and npm exports
    // its own flags as npm_config_*: under `npm publish --dry-run` the nested
    // pack inherited `npm_config_dry_run` and wrote nothing, failing the gate
    // over a tarball npm had no intention of making. The gate packs for real
    // whatever the caller's npm was asked to do.
    const env = { ...process.env }
    // case-insensitive: Windows env vars can be NPM_CONFIG_DRY_RUN
    for (const key of Object.keys(env)) {
      if (/^npm_config_/i.test(key)) delete env[key]
    }
    run("npm", ["pack", "--silent", "--pack-destination", root], { cwd: pkgRoot, stdio: "ignore", env })
    // The file name comes from the directory, not from npm's output: a quiet
    // npm prints nothing, and a Windows npm prints CRLF.
    const tgz = tarballOf(root)
    run("tar", ["-xzf", join(root, tgz), "-C", root], { stdio: "inherit" })
    const pkg = join(root, "package")
    // Every file the packed suite loads: the test files import the plugin, the
    // generator script, both tests' helpers and the docs the style test reads.
    // A file dropped from `files` fails here with this message rather than
    // deep inside the suite as "node --test failed".
    for (const file of ["index.mjs", "lib/internal.mjs", "lib/signinpage.mjs", "lib/native.mjs", "native/binary-name.mjs", "lib/catalog.mjs", "scripts/catalog.mjs", "scripts/tarball.mjs", "scripts/build-native.mjs", "native/go.mod", "test/plugin.test.mjs", "test/style.test.mjs", "test/native.test.mjs", "README.md", "CHANGELOG.md"]) {
      if (!existsSync(join(pkg, file))) throw new Error(`the tarball is missing ${file}, which the suite needs`)
    }
    // The proxy binaries are optional, but when the source tree built them the
    // package must carry all five intact (see requireNativeBin).
    const checked = requireNativeBin(pkgRoot, pkg)
    if (checked) console.log(`native/bin: ${checked} builds present in the tarball`)
    const suite = (cmd, args) => {
      try {
        // CODAR_TARBALL_GATE tells the suite it is running inside this check:
        // the test of the gate itself skips there, or the suite would run the
        // gate again from inside the tarball, each level packing another one.
        execFileSync(cmd, args, { cwd: pkg, stdio: "inherit", env: { ...process.env, CODAR_TARBALL_GATE: "1", CODAR_PLUGIN_DISABLE_NATIVE: "1" } })
      } catch (e) {
        if (e?.code === "ENOENT") {
          const missing = new Error(`${cmd} was not found in PATH; this check needs it`)
          missing.missingProgram = true
          throw missing
        }
        throw new Error(`${cmd} ${args.join(" ")} failed inside the packed tarball`)
      }
    }
    console.log("node --test (inside the packed tarball)")
    suite("node", ["--test"])
    console.log("bun test (inside the packed tarball)")
    try {
      suite("bun", ["test"])
    } catch (e) {
      // Only a Bun that is not installed is a skip on a developer's machine;
      // a Bun that ran and failed is a failure everywhere. --require-bun
      // (what CI passes) makes even the missing one an error.
      if (requireBun && e.missingProgram) {
        // "It could not run here" is not "the packed suite failed": 2 tells a
        // caller to fix the machine, 1 tells it the artifact is bad.
        const cannot = usage(e.message)
        cannot.exitCode = 2
        throw cannot
      }
      if (requireBun || !e.missingProgram) throw e
      console.log(`${e.message} — skipped (pass --require-bun to make this an error)`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const isMain = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isMain) {
  try {
    main()
  } catch (e) {
    console.error(e?.message ?? e)
    process.exitCode = e?.exitCode ?? 1
  }
}
