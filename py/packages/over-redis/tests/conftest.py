import os
import secrets

import pytest
from redis.asyncio import Redis


def _redis_url() -> str | None:
    return os.environ.get("REDIS_URL")


@pytest.fixture
def redis_url():
    url = _redis_url()
    if not url:
        pytest.skip("REDIS_URL not set")
    return url


@pytest.fixture
def key_prefix():
    return f"clam-test-{secrets.token_hex(4)}"


@pytest.fixture
async def cleanup(redis_url, key_prefix):
    yield
    r = Redis.from_url(redis_url)
    keys = await r.keys(f"{key_prefix}:*")
    if keys:
        await r.delete(*keys)
    await r.aclose()
