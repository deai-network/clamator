from clamator_over_redis import RedisRpcServer
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithService, PingParams, arith_contract


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


async def build_arith_server(*, redis: Redis, key_prefix: str) -> RedisRpcServer:
    server = RedisRpcServer(redis=redis, key_prefix=key_prefix)  # injected redis= not closed by stop() — caller owns lifecycle; omit to let transport own it  # noqa: E501
    server.register_service(arith_contract, Arith())  # must precede start() — post-start registrations are silently ignored, no consumer group or read loop is created  # noqa: E501
    await server.start()
    return server
