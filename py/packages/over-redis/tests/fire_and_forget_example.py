from clamator_over_redis import RedisRpcClient

from .generated.arith import ArithClient, PingParams


# Fire-and-forget: notification proxies return once the request is queued in Redis;
# they do not wait for the server to process. Handlers must be idempotent — see
# "Worker-pool semantics" for the at-least-once delivery details.
async def fire_notification(key_prefix: str) -> None:
    client = RedisRpcClient(key_prefix=key_prefix)
    await client.start()
    arith = ArithClient(client)
    await arith.ping(PingParams())
    await client.stop()
