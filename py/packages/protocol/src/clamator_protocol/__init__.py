"""clamator-protocol: pure protocol layer for clamator polyglot RPC."""

from .contract import Contract, MethodEntry
from .envelope import (
    Envelope, RequestEnvelope, NotificationEnvelope,
    SuccessResponseEnvelope, ErrorResponseEnvelope,
    EnvelopeKind, RpcId, SERVICE_RE, METHOD_RE,
    parse_envelope, build_request, build_notification,
    build_success_response, build_error_response,
)
from .error import (
    RpcError, ClamatorProtocolError, ClamatorTransportError, exception_to_error_data,
)
from .transport import Transport, Dispatcher
from .server_core import RpcServerCore
from .client_core import RpcClientCore, ClamatorClient

__all__ = [
    "Contract", "MethodEntry",
    "Envelope", "RequestEnvelope", "NotificationEnvelope",
    "SuccessResponseEnvelope", "ErrorResponseEnvelope",
    "EnvelopeKind", "RpcId", "SERVICE_RE", "METHOD_RE",
    "parse_envelope", "build_request", "build_notification",
    "build_success_response", "build_error_response",
    "RpcError", "ClamatorProtocolError", "ClamatorTransportError",
    "exception_to_error_data",
    "Transport", "Dispatcher",
    "RpcServerCore", "RpcClientCore", "ClamatorClient",
]
