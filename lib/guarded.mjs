// guarded.mjs: the ordinary fetch the plugin falls back on, without the hop
// its proxy refuses.
//
// The plugin reaches the vendor two ways: through the Go proxy, whose client
// follows a redirect only on the host and port the request started on
// (native/cmd/codar-proxy/main.go, checkRedirect), and through the ordinary
// fetch it falls back on where there is no proxy — no build for the platform,
// a proxy that did not start. Only the first was guarded. fetch follows any
// Location and carries the headers it was given, and the plugin writes the
// account's credential into Authorization (or X-Api-Key) on every request, so
// a redirect from an address to a second host took that credential there. A
// synthetic sink received it on 2026-08-16.
//
// guardedFetch is fetch with the proxy's rule: a redirect off the origin the
// request started on is not followed, and is returned to the caller as the
// answer it is — the same shape, so a refusal still reads as a refusal. The
// origin includes the port, so another port on the vendor's own name is another
// service and is refused too. At most five hops, as the proxy allows. A body
// that cannot be sent twice (a stream, a FormData fetch would encode again)
// stops at the redirect: re-sending it would send a request that is not the
// one the caller made. A string or bytes body is sent again as it was.
//
// Every request goes through a transport: the runtime's fetch unless a test
// names its own. The guarded fetch never lets fetch choose a hop: each request
// carries the manual redirect mode, the hops the rule allows are sent one at a
// time, and any other redirect is the answer.
//
// The runtime's fetch (runtimeTransport) is where the guard ends. Node 24.22.1
// answered a 302 with the hop it followed for some calls to fetch made inside
// a function, depending on statements elsewhere in it; the shape it answered
// as an answer there is the one below, and a Request carries the mode whatever
// the code around the call. The tests name their own transport over loopback,
// where the rule itself is pinned; the runtime's fetch is not asked to prove
// itself, and a test does not pin what a runtime decides to do with a Request.

const MAX_HOPS = 5

// A string or bytes body is the same request however often it is sent. The
// bytes for a body a caller handed over once are taken with bytesOf, once,
// and only when a hop is about to be taken.
const replayable = (body) => body == null || typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)

const bytesOf = async (body) => {
  if (body == null) return undefined
  const whole = typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)
  return whole ? body : new Uint8Array(await new Response(body).arrayBuffer())
}

export const guardedFetch = (url, init = {}, options = {}) => {
  // The address is taken as fetch takes one: a string, a URL or a Request. A
  // Request keeps its own method, headers and body, and a Request naming the
  // base such a URL is taken as is.
  const resolved = new Request(url, init)
  const origin = originOfAddress(options.origin ?? resolved.url)
  // Only an https origin is held to the rule: the plugin's addresses are
  // https, and an address that is not https is the caller's own to use as it
  // was, redirect mode and all. `origin` is the test's own origin, `transport`
  // the test's own fetch (see the note above): the plugin sets neither.
  if (origin === null) return (options.transport ?? runtimeTransport)(url, init)
  return follow(resolved.url, init, { ...options, origin })
}

// runtimeTransport is the runtime's fetch, given the request as a Request so
// the redirect mode is the one the request was built with.
const runtimeTransport = (url, init) => fetch(new Request(url, init))

// originOfAddress is the serialized origin of an address, or null when the
// address is not https (its scheme is compared after URL parsing, which reads
// the case of a scheme the way a browser does: HTTPS: is https:). An address
// fetch cannot resolve is not guarded either: fetch answers its own TypeError.
const originOfAddress = (address) => {
  try {
    const parsed = new URL(address)
    return parsed.protocol === "https:" ? parsed.origin : null
  } catch {
    return null
  }
}

// follow is the rule: the first answer, then a hop only to the origin the
// request started on, and only for a body that can be sent again. It is a
// chain of answers: hopOn is given each one and starts the request that
// follows it, over the caller's transport or the runtime's. A bytes body is
// taken once, before the first request, so a caller changing its array while
// the first answer is pending cannot change what a later hop carries.
const follow = (url, init, options) => {
  const once = snapshot(init)
  return hopOn({ at: url, hops: 0, init: once, options, res: (options.transport ?? runtimeTransport)(url, requestOf(once, once.body)) })
}

// hopOn hands the answer it is given to the step that reads it. That step
// (inHopOf) is the whole of the decision, written in one expression each: the
// note at the top says what that protects.
const hopOn = (s) => s.res.then((res) => inHopOf(s, res))

const inHopOf = (s, res) => res.status >= 300 && res.status < 400 && s.hops < MAX_HOPS
  ? inHop(s, hopOf(s.options.origin, s.at, res.headers.get("location")))
  : s.res

const inHop = (s, next) => next === null || !replayable(s.init.body)
  ? s.res
  : hopOn({ ...s, at: next, hops: s.hops + 1, res: (s.options.transport ?? runtimeTransport)(next, requestOf(s.init, s.init.body)) })

// requestOf is the caller's init with the manual redirect mode. A body is
// left out rather than sent as undefined, so a GET stays a GET.
const requestOf = (init, body) => body === undefined ? { ...init, redirect: "manual" } : { ...init, body, redirect: "manual" }

// snapshot is the init with a bytes body copied: a view keeps only its own
// bytes, at its own offset, and the copy is what every request built from it
// carries.
const snapshot = (init) => {
  const body = init.body
  if (body == null || typeof body === "string" || body instanceof ArrayBuffer) return init
  return ArrayBuffer.isView(body) ? { ...init, body: body.slice() } : init
}

// hopOf is the address of the one hop a redirect away from current may take,
// or null when it may not be taken. The origin is where the request started,
// port included, so another port on the vendor's own name is another service;
// a Location that only closes a fragment, or resolves back to the request
// itself, is not a new request.
export const hopOf = (origin, current, location) => {
  const absolute = location == null ? null : safeURL(location, current)
  const base = safeURL(current, current)
  const here = absolute !== null && base !== null && absolute.pathname === base.pathname && absolute.search === base.search
  const same = absolute !== null && base !== null && absolute.origin === base.origin
  return here || !same || base.origin !== origin ? null : absolute.href
}

const safeURL = (location, current) => {
  try {
    return new URL(location, current)
  } catch {
    return null
  }
}
