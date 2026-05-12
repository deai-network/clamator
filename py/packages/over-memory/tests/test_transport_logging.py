import logging

import pytest
from clamator_over_memory import MemoryBus
from clamator_over_memory.transport import MemoryTransport
from clamator_protocol import ClamatorTransportError

LOGGER_NAME = "clamator_over_memory.transport"


async def test_logs_dispatcher_exception_wrapping(caplog):
    bus = MemoryBus()

    async def boom(env):
        raise ValueError("boom")

    bus.register("arith", boom)

    t = MemoryTransport(bus)
    await t.start()

    caplog.set_level(logging.WARNING, logger=LOGGER_NAME)

    req = {
        "jsonrpc": "2.0", "id": "i1", "method": "arith.add", "params": {},
    }
    with pytest.raises(ClamatorTransportError) as ei:
        await t.send(req, timeout=1.0)

    assert "dispatcher threw" in str(ei.value)
    # The cause chain is preserved on the wrapper.
    assert isinstance(ei.value.__cause__, ValueError) or any(
        isinstance(arg, ValueError) for arg in ei.value.args
    ) or getattr(ei.value, "cause", None) is not None

    records = [r for r in caplog.records if r.name == LOGGER_NAME]
    assert len(records) == 1
    rec = records[0]
    assert rec.levelno == logging.WARNING
    assert rec.exc_info is not None

    await t.stop()
