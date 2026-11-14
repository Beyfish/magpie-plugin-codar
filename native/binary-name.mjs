// native/binary-name.mjs: one naming rule for the proxy's builds.
//
// Both sides use it: scripts/build-native.mjs names the files it writes, and
// native.mjs names the file it looks for. They were written apart once and
// disagreed on Windows ("windows" against Node's "win32"), so a Windows build
// existed and was never found. A build is named by the Node platform and
// architecture that runs it — darwin/linux/win32 and arm64/amd64 — whatever
// Go calls them.

const platformName = (platform) => platform
const archName = (arch) => (arch === "x64" ? "amd64" : arch === "ia32" ? "386" : arch)

// binaryFile is the file name of the build for one platform and architecture.
export function binaryFile(platform, arch) {
  return `codar-proxy-${platformName(platform)}-${archName(arch)}${platformName(platform) === "win32" ? ".exe" : ""}`
}
