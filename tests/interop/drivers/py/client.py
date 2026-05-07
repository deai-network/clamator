import asyncio
import json
import sys
from typing import Any
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcClient
from clamator_protocol import RpcError, ClamatorTransportError


async def invoke_call(client: RedisRpcClient, call: dict[str, Any]) -> dict[str, Any]:
    method = call["method"]
    service, _, m = method.partition(".")
    try:
        if call.get("notification"):
            await client.notify(service, m, call.get("params"))
            return {"ok": True, "kind": "notification"}
        else:
            r = await client.call(service, m, call.get("params"))
            return {"ok": True, "kind": "result", "result": r}
    except RpcError as e:
        return {"ok": False, "kind": "rpc-error",
                "code": e.code, "message": e.message, "data": e.data}
    except ClamatorTransportError as e:
        return {"ok": False, "kind": "transport-error", "message": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "kind": "unknown-error", "message": str(e)}


async def main() -> None:
    cfg: dict[str, Any] = json.loads(sys.stdin.read())
    redis = Redis.from_url(cfg["redisUrl"])
    client = RedisRpcClient(
        redis=redis, key_prefix=cfg["keyPrefix"],
        default_timeout_ms=cfg.get("defaultTimeoutMs", 5000),
    )
    await client.start()

    concurrent: int = cfg.get("concurrent", 1) or 1
    calls: list[dict[str, Any]] = cfg["calls"]

    if concurrent > 1:
        # Fan out: run the call list `concurrent` times in parallel
        batches = await asyncio.gather(
            *[
                asyncio.gather(*[invoke_call(client, call) for call in calls])
                for _ in range(concurrent)
            ]
        )
        results = [item for batch in batches for item in batch]
    else:
        results = []
        for call in calls:
            results.append(await invoke_call(client, call))

    print(json.dumps({"results": results}), flush=True)
    await client.stop()
    await redis.aclose()


asyncio.run(main())
