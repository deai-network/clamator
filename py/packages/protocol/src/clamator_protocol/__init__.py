"""clamator-protocol: pure protocol layer for clamator polyglot RPC."""

from .client_core import ClamatorClient, RpcClientCore
from .contract import Contract, MethodEntry
from .envelope import (
    METHOD_RE,
    SERVICE_RE,
    Envelope,
    EnvelopeKind,
    ErrorResponseEnvelope,
    NotificationEnvelope,
    RequestEnvelope,
    RpcId,
    SuccessResponseEnvelope,
    build_error_response,
    build_notification,
    build_request,
    build_success_response,
    parse_envelope,
)
from .error import (
    ClamatorProtocolError,
    ClamatorTransportError,
    RpcError,
    exception_to_error_data,
)
from .server_core import RpcServerCore
from .transport import Dispatcher, Transport

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
