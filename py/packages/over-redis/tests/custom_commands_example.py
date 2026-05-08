from clamator_over_redis import RedisRpcServer
from clamator_protocol import Contract, MethodEntry
from pydantic import BaseModel
from redis.asyncio import Redis

from .generated.arith import AddParams, AddResult, ArithService, PingParams, arith_contract


class EchoP(BaseModel):
    msg: str


class EchoR(BaseModel):
    msg: str


# Hand-built contract for user-defined commands. Same shape as a codegen-
# emitted contract; just authored inline instead of imported from a generated
# module. Use this pattern when adding services to an engine at registration
# time without going through the codegen pipeline (e.g., user-supplied
# custom commands collected at boot).
custom_commands_contract = Contract(
    service="custom-commands",
    methods={
        "echo": MethodEntry(params_model=EchoP, result_model=EchoR, handler_attr="echo"),
    },
)


class Arith(ArithService):
    async def add(self, params: AddParams) -> AddResult:
        return AddResult(sum=params.a + params.b)

    async def ping(self, params: PingParams) -> None:
        return None


class CustomCommands:
    async def echo(self, params: EchoP) -> EchoR:
        return EchoR(msg=params.msg)


# One RedisRpcServer hosts both the codegen-emitted arith service and the
# hand-built custom-commands service. register_service must be called for
# each contract before start(); each gets its own consumer group keyed by
# the contract's service name.
async def build_extended_server(*, redis: Redis, key_prefix: str) -> RedisRpcServer:
    server = RedisRpcServer(redis=redis, key_prefix=key_prefix)
    server.register_service(arith_contract, Arith())
    server.register_service(custom_commands_contract, CustomCommands())
    await server.start()
    return server
