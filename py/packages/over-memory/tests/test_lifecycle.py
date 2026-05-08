import pytest
from clamator_over_memory.bus import MemoryBus
from clamator_over_memory.transport import MemoryTransport
from clamator_protocol import ClamatorTransportError


async def test_send_before_start_rejects():
    bus = MemoryBus()
    t = MemoryTransport(bus)
    with pytest.raises(ClamatorTransportError):
        await t.send({"jsonrpc": "2.0", "method": "a.b", "params": {}, "id": "1"}, timeout=0.1)


async def test_send_after_stop_rejects():
    bus = MemoryBus()
    t = MemoryTransport(bus)
    await t.start()
    await t.stop()
    with pytest.raises(ClamatorTransportError):
        await t.send({"jsonrpc": "2.0", "method": "a.b", "params": {}, "id": "1"}, timeout=0.1)


async def test_duplicate_service_registration():
    bus = MemoryBus()
    t1 = MemoryTransport(bus)
    t2 = MemoryTransport(bus)
    await t1.start()
    await t2.start()

    async def d(env): return None
    await t1.register_service("arith", d)
    with pytest.raises(ValueError, match="already registered"):
        await t2.register_service("arith", d)
