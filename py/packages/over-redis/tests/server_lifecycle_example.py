import asyncio
import signal

from clamator_over_redis import RedisRpcServer
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithService, PingParams, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


# Long-running server that stops gracefully on SIGTERM/SIGINT.
# Wire pattern: start the server, then await an asyncio.Event that the signal
# handlers .set() on receipt; on wake, call await server.stop() in a finally
# so the drain still runs even if the awaiter is cancelled.
async def run_arith_server(*, redis: Redis, key_prefix: str) -> None:
    server = RedisRpcServer(redis=redis, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    await server.start()
    stop_event = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)
    try:
        await stop_event.wait()
    finally:
        await server.stop()
