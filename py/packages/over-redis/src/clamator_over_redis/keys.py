def command_stream(prefix: str, service: str) -> str:
    return f"{prefix}:cmds:{service}"


def reply_stream(prefix: str, instance_id: str) -> str:
    return f"{prefix}:replies:{instance_id}"


def consumer_group_name(service: str) -> str:
    return service


def consumer_name(service: str, instance_id: str) -> str:
    return f"{service}:{instance_id}"
