import logging

from clamator_over_redis.server_transport import ServerRedisTransport

SERVER_LOGGER = "clamator_over_redis.server_transport"


class StubRedis:
    """Minimal async stub for unit tests that exercise _handle_entry without real redis."""

    def __init__(self) -> None:
        self.acks: list = []
        self.adds: list = []

    async def xack(self, stream, group, entry_id):
        self.acks.append((stream, group, entry_id))

    async def xadd(self, *args, **kwargs):
        self.adds.append((args, kwargs))

    async def aclose(self):
        pass


async def test_handle_entry_logs_poison_envelope(caplog):
    redis = StubRedis()
    t = ServerRedisTransport(redis=redis, key_prefix="kp")
    # Bypass start() — we only exercise _handle_entry.
    caplog.set_level(logging.WARNING, logger=SERVER_LOGGER)

    fields = {b"envelope": b"not-valid-json-at-all"}
    await t._handle_entry("arith", "stream", "grp", "1-0", fields)

    # The bad envelope must still be acked (so it doesn't replay).
    assert redis.acks == [("stream", "grp", "1-0")]

    records = [r for r in caplog.records if r.name == SERVER_LOGGER]
    assert len(records) == 1
    rec = records[0]
    assert rec.levelno == logging.WARNING
    assert rec.exc_info is not None
