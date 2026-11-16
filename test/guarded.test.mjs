// The plugin's fallback transport carries the proxy's redirect rule.
//
// The plugin reaches the vendor through its Go proxy when it can, and through
// an ordinary fetch when it cannot (no build for the platform, a proxy that did
// not start). The proxy returns a redirect that leaves the request's own
// origin; plain fetch followed it, headers and credential included, to any
// host a Location named. These pin the guarded fetch that closes that.
//
// The rule is written over https addresses and a test cannot speak https to a
// loopback server without a certificate, so the guarded fetch takes the
// transport it sends through (and the origin it keeps). Requests here are
// answered from a plan, not a socket, for the same reason and so that each
// test sends exactly the requests it means to.

import assert from "node:assert/strict"
import { createServer } from "node:http"
import { test } from "node:test"

import { guardedFetch, hopOf } from "../lib/guarded.mjs"

const vendor = "https://api.claw.speedai.com"

// planned is a transport that answers every request as a 302 to the address
// the test names from the one it was given, and records every request the rule
// sent.
const nextId = (url) => `/chain?n=${Number(new URL(url).searchParams.get("n") ?? "0") + 1}`
const planned = (next) => {
  const asked = []
  const transport = (url, init) => {
    asked.push({ url: String(url), redirected: init?.redirect })
    return Promise.resolve(new Response(null, { status: 302, headers: { location: next(String(url)) } }))
  }
  return { transport, asked }
}

test("a redirect off the origin is returned, not followed", async () => {
  const { transport, asked } = planned(() => "https://evil.example/collect")
  const res = await guardedFetch(`${vendor}/v1/chat/completions`, { method: "POST", headers: { authorization: "Bearer SYNTH" }, body: "{}" }, { transport })
  assert.equal(res.status, 302, "the redirect is the answer, not a followed hop")
  assert.deepEqual(asked.map((a) => a.url), [`${vendor}/v1/chat/completions`], "only the request the caller made was sent, with its credential")
  assert.equal(asked[0].redirected, "manual", "the request carried the manual redirect mode")
})

test("a redirect is read on its own, and a hop off the origin is not taken", async () => {
  // The rule's steps in the order it takes them: an answer that is a redirect
  // is read for its Location, and a Location off the origin is the answer the
  // caller gets. (Which Locations are hops is pinned by hopOf, last test.)
  const { transport, asked } = planned(nextId)
  const res = await guardedFetch(`${vendor}/chain?n=0`, { redirect: "manual" }, { transport, origin: "https://elsewhere.example" })
  assert.equal(asked.length, 1, "neither the stack nor the plan sends a second request")
  assert.equal(res.status, 302)
})

test("a hop that leaves https is not taken", async () => {
  const { transport, asked } = planned((url) => url.replace("https:", "http:").replace("/chain", "/plain"))
  const res = await guardedFetch(`${vendor}/chain`, {}, { transport })
  assert.equal(asked.length, 1, "a downgrade is a different origin")
  assert.equal(res.status, 302)
})

test("a body that cannot be sent twice stops at the redirect", async () => {
  // A one-shot body is read by the request that carries it. The transport reads
  // it here; if the rule sent a hop with the spent stream, that would throw.
  const asked = []
  const transport = async (url, init) => {
    asked.push(String(url))
    await new Response(init?.body).arrayBuffer()
    return new Response(null, { status: 302, headers: { location: nextId(String(url)) } })
  }
  const body = new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.close() } })
  const res = await guardedFetch(`${vendor}/chain?n=0`, { method: "POST", body, duplex: "half" }, { transport })
  assert.equal(res.status, 302)
  assert.equal(asked.length, 1, "a body sent once is not sent twice")
})

test("the request the rule sends on its own is the caller's", async () => {
  // Through the runtime's own transport (the default) the request is sent as a
  // Request, which carries the manual redirect mode. Node 24.22.1 was measured
  // answering one such call with the hop it followed (see the note at the top
  // of guarded.mjs), so this pins the request the rule builds, not what a
  // runtime does with it.
  const seen = []
  const server = createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ""}`)
    res.end("ok")
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const base = `http://127.0.0.1:${server.address().port}`
    const res = await guardedFetch(`${base}/v1/models`, { headers: { authorization: "Bearer SYNTH" } }, { origin: base })
    assert.equal(await res.text(), "ok")
    assert.deepEqual(seen, ["GET /v1/models Bearer SYNTH"])
  } finally {
    server.close()
  }
})

test("the rule keeps the origin it was given, port included", () => {
  // hopOf is the guarded fetch's own answer for one Location, without a
  // socket: the origin includes the port, so another port on the vendor's name
  // is another service.
  const at = vendor + "/v1/chat/completions"
  assert.equal(hopOf(vendor, at, "/v1/models"), vendor + "/v1/models")
  assert.equal(hopOf(vendor, at, vendor + "/v1"), vendor + "/v1")
  assert.equal(hopOf(vendor, at, "https://api.claw.speedai.com:8443/v1"), null)
  assert.equal(hopOf(vendor, at, "https://api.claw.speedai.com.evil.example/v1"), null)
  assert.equal(hopOf(vendor, at, "https://evil.example/api.claw.speedai.com"), null)
  assert.equal(hopOf(vendor, at, "http://api.claw.speedai.com/v1"), null)
  // another id on the same name is another origin for the URL parser, and a
  // Location that only closes a fragment or repeats the request is not a hop
  assert.equal(hopOf("http://127.0.0.1:5000", "http://localhost:5000/x", "/y"), null)
  assert.equal(hopOf(vendor, at, "#fragment"), null)
  assert.equal(hopOf(vendor, at, at), null)
  assert.equal(hopOf(vendor, at, null), null)
})

test("an address that is not https is left to the caller's own fetch", async () => {
  // The plugin's addresses are https; an address a caller wrote down as plain
  // http is handed to fetch with the init exactly as given, redirect mode and
  // all, and the rule takes no hop for it.
  const { transport, asked } = planned(() => "/elsewhere")
  const res = await guardedFetch("http://example.invalid/start", { method: "POST", body: "{}", redirect: "follow" }, { transport })
  assert.equal(res.status, 302)
  assert.deepEqual(asked, [{ url: "http://example.invalid/start", redirected: "follow" }], "the caller's init reached the transport unchanged")
})
