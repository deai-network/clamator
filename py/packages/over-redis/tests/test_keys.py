from clamator_over_redis.keys import (
    command_stream, reply_stream, consumer_group_name, consumer_name,
)


def test_command_stream():
    assert command_stream("app", "engine") == "app:cmds:engine"


def test_reply_stream():
    assert reply_stream("app", "i") == "app:replies:i"


def test_consumer_group_name_equals_service():
    assert consumer_group_name("engine") == "engine"


def test_consumer_name():
    assert consumer_name("engine", "i") == "engine:i"
