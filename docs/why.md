
● Closest alternatives and how clamator differs:

  Alternatives in same niche

  ┌──────────────────────────┬─────────────────┬──────────────────┬──────────────────────┬───────────────────┬──────────────────────────────────────────┐
  │           Tool           │      Wire       │ Contract source  │    Polyglot TS↔Py    │     Transport     │                 DX cost                  │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ gRPC                     │ protobuf binary │ .proto IDL       │ Yes (full)           │ HTTP/2 mandatory  │ High: .proto toolchain                   │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ JSON-RPC 2.0 (raw)       │ JSON            │ None             │ Yes (manually typed) │ Any (DIY framing) │ Low envelope cost, high integration cost │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ tRPC                     │ JSON            │ TS types + Zod   │ TS-only              │ HTTP/WebSocket    │ Lowest in TS, doesn't cross              │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ ts-rest                  │ HTTP REST       │ Zod              │ TS-only              │ HTTP              │ Same — TS-only                           │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ Cap'n Proto              │ binary          │ .capnp IDL       │ Yes (full)           │ Any               │ High: IDL toolchain, less idiomatic      │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ OpenAPI + generators     │ JSON over HTTP  │ OpenAPI YAML     │ Yes (codegen)        │ HTTP only         │ Medium; REST-shape mismatch for RPC      │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ NATS request-reply (raw) │ bytes           │ None             │ Yes (manual)         │ NATS only         │ Low at envelope, high at types           │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ DeepKit RPC              │ binary          │ TS runtime types │ Some (Py exp)        │ WebSocket         │ Medium; less mature                      │
  ├──────────────────────────┼─────────────────┼──────────────────┼──────────────────────┼───────────────────┼──────────────────────────────────────────┤
  │ Pyro/Pyro5               │ pickle/serpent  │ Python types     │ Py-only              │ Pyro              │ N/A — single-lang                        │
  └──────────────────────────┴─────────────────┴──────────────────┴──────────────────────┴───────────────────┴──────────────────────────────────────────┘

  Where clamator sits

  Clamator's combo is unusual:

  1. Zod-as-source-of-truth (idiomatic TS DX) — like tRPC/ts-rest. Unlike gRPC/Cap'n Proto's separate IDL.
  2. JSON-RPC 2.0 wire (text, debuggable, language-neutral, mature spec). Unlike protobuf/capnp binary; unlike tRPC's bespoke envelope.
  3. Cross-language codegen Zod → Pydantic. Unlike tRPC/ts-rest (TS-only).
  4. Pluggable, stream-based transport (redis-streams, NATS, in-memory). Unlike gRPC (HTTP/2-locked) or tRPC (HTTP/WebSocket-locked).
  5. First-class consumer-group worker-pool semantics baked into the redis adapter. Existing JSON-RPC libs don't define this; raw NATS/redis users hand-roll it.

  The niche

  "Polyglot TS↔Py RPC where the substrate is a queue/stream (redis-streams, NATS), with Zod as authoritative contract."

  That's narrow on purpose. The intersection of:
  - TS + Py services in same system
  - Communicating over redis or NATS (already chosen for other reasons: pub/sub, durability, fanout)
  - Wanting typed contracts without a separate IDL toolchain
  - Wanting consumer-group worker-pool RPC, not 1:1 sticky sessions

  …is unserved. Existing options force you to either (a) adopt HTTP-locked RPC (gRPC, tRPC) and run a parallel queue separately, or (b) hand-roll JSON-RPC over redis with no contract layer
  (excavator's pre-howler state).

  What clamator deliberately doesn't do

  - HTTP transport (yet) — redundant with gRPC/tRPC; clamator's edge is the queue substrate
  - Binary wire — debuggability + neutrality > marginal byte savings; consumers needing perf can swap envelope serializer
  - Streaming results / bidirectional calls — gRPC's strength; clamator stays request-reply + notifications
  - Cancellation propagation — idempotency contract makes it unnecessary

  Risks to the niche being real

  - Most "I need polyglot RPC" reach for gRPC by default; clamator must justify the deviation.
  - Most "I need typed Zod" reach for tRPC; will only consider clamator if Py is in the mix.
  - Many redis/NATS users write ad-hoc envelopes and never feel the pain enough to adopt a library.
  - Codegen step adds friction vs tRPC's zero-codegen DX. Justified only by Py target.

  Bottom line

  Clamator fills an obvious-after-you-see-it gap: stream-transport RPC with typed contracts crossing TS↔Py.
