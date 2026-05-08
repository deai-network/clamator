from clamator_over_redis import RedisRpcClient

from .generated.arith import AddParams, AddResult, ArithClient
from .generated.logger import LoggerClient, LogParams


# One key_prefix-pinned RedisRpcClient backs many service proxies.
async def call_multiple_services(key_prefix: str) -> AddResult:
    client = RedisRpcClient(key_prefix=key_prefix)
    await client.start()
    arith = ArithClient(client)
    logger = LoggerClient(client)
    r = await arith.add(AddParams(a=2, b=3))
    await logger.log(LogParams(msg=f"sum={r.sum}"))
    await client.stop()
    return r
