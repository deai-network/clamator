import asyncio
import json
import sys
from typing import Any
from redis.asyncio import Redis
from clamator_over_redis import RedisRpcServer
from clamator_protocol import RpcError

import sys as _sys, importlib.util

# Import the generated contract modules at runtime
def _import(path: str, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


async def main() -> None:
    cfg: dict[str, Any] = json.loads(sys.stdin.read())
    contract = cfg["contract"]
    base = cfg.get("generatedDir", "tests/interop/generated/py")
    arith_mod = _import(f"{base}/arith.py", "arith")
    notif_mod = _import(f"{base}/notifications.py", "notifications")
    redis = Redis.from_url(cfg["redisUrl"])
    server = RedisRpcServer(
        redis=redis, key_prefix=cfg["keyPrefix"],
        instance_id=cfg.get("instanceId"),
        consumer_claim_idle_ms=cfg.get("consumerClaimIdleMs", 60_000),
    )
    if contract == "arith":
        class Arith(arith_mod.ArithService):
            async def add(self, params): return arith_mod.AddResult(sum=params.a + params.b)
            async def slow_add(self, params):
                await asyncio.sleep(params.sleep_ms / 1000.0)
                return arith_mod.SlowAddResult(sum=params.a + params.b)
            async def divide(self, params):
                if params.b == 0: raise RpcError(-32000, "division by zero")
                return arith_mod.DivideResult(q=params.a / params.b)
            async def echo_text(self, params): return arith_mod.EchoTextResult(text=params.text)
        server.register_service(arith_mod.arith_contract, Arith())
    else:
        class Notif(notif_mod.NotificationsService):
            async def ping(self, params): pass
        server.register_service(notif_mod.notifications_contract, Notif())
    await server.start()
    print("READY", flush=True)
    try:
        await asyncio.Event().wait()
    finally:
        await server.stop()
        await redis.close()


asyncio.run(main())
