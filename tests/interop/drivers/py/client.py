import asyncio
import json
import sys
from typing import Any
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcClient
from clamator_protocol import RpcError, ClamatorTransportError


async def main() -> None:
    cfg: dict[str, Any] = json.loads(sys.stdin.read())
    redis = Redis.from_url(cfg["redisUrl"])
    client = RedisRpcClient(
        redis=redis, key_prefix=cfg["keyPrefix"],
        default_timeout_ms=cfg.get("defaultTimeoutMs", 5000),
    )
    await client.start()
    results = []
    for call in cfg["calls"]:
        method = call["method"]
        service, _, m = method.partition(".")
        try:
            if call.get("notification"):
                await client.notify(service, m, call["params"])
                results.append({"ok": True, "kind": "notification"})
            else:
                r = await client.call(service, m, call["params"])
                results.append({"ok": True, "kind": "result", "result": r})
        except RpcError as e:
            results.append({"ok": False, "kind": "rpc-error",
                            "code": e.code, "message": e.message, "data": e.data})
        except ClamatorTransportError as e:
            results.append({"ok": False, "kind": "transport-error", "message": str(e)})
        except Exception as e:  # noqa: BLE001
            results.append({"ok": False, "kind": "unknown-error", "message": str(e)})
    print(json.dumps({"results": results}), flush=True)
    await client.stop()
    await redis.close()


asyncio.run(main())
