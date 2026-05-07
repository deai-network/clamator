from __future__ import annotations
import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Union

SERVICE_RE = re.compile(r"^[a-z][a-z0-9-]*$")
METHOD_RE = re.compile(r"^[a-z][a-zA-Z0-9-]*$")


class EnvelopeKind(Enum):
    REQUEST = "request"
    NOTIFICATION = "notification"
    SUCCESS_RESPONSE = "success"
    ERROR_RESPONSE = "error"


RpcId = Union[str, int]


@dataclass(frozen=True)
class RequestEnvelope:
    service: str
    method: str
    full_method: str
    params: Any
    id: RpcId
    raw: dict[str, Any] = field(repr=False)
    kind: EnvelopeKind = EnvelopeKind.REQUEST


@dataclass(frozen=True)
class NotificationEnvelope:
    service: str
    method: str
    full_method: str
    params: Any
    raw: dict[str, Any] = field(repr=False)
    kind: EnvelopeKind = EnvelopeKind.NOTIFICATION


@dataclass(frozen=True)
class SuccessResponseEnvelope:
    id: RpcId
    result: Any
    kind: EnvelopeKind = EnvelopeKind.SUCCESS_RESPONSE


@dataclass(frozen=True)
class ErrorResponseEnvelope:
    id: RpcId | None
    error: dict[str, Any]
    kind: EnvelopeKind = EnvelopeKind.ERROR_RESPONSE


Envelope = Union[
    RequestEnvelope, NotificationEnvelope, SuccessResponseEnvelope, ErrorResponseEnvelope
]


def _invalid(msg: str) -> ValueError:
    return ValueError(f"-32600 Invalid Request: {msg}")


def parse_envelope(value: Any) -> Envelope:
    if isinstance(value, list):
        raise _invalid("batch requests not supported")
    if not isinstance(value, dict):
        raise _invalid("not an object")
    if value.get("jsonrpc") != "2.0":
        raise _invalid('jsonrpc must equal "2.0"')

    has_method = isinstance(value.get("method"), str)
    has_result = "result" in value
    has_error = "error" in value
    has_id = "id" in value and value["id"] is not None

    if has_method:
        full_method = value["method"]
        if "." not in full_method:
            raise _invalid('method must be "<service>.<method>"')
        service, _, method = full_method.partition(".")
        if not service or not method:
            raise _invalid('method must be "<service>.<method>"')
        if not SERVICE_RE.match(service):
            raise _invalid("invalid service segment")
        if not METHOD_RE.match(method):
            raise _invalid("invalid method segment")
        if has_id:
            rpc_id = value["id"]
            if not isinstance(rpc_id, (str, int)):
                raise _invalid("id must be string or number")
            return RequestEnvelope(
                service=service, method=method, full_method=full_method,
                params=value.get("params", {}), id=rpc_id, raw=value,
            )
        return NotificationEnvelope(
            service=service, method=method, full_method=full_method,
            params=value.get("params", {}), raw=value,
        )

    if has_result and not has_error:
        if not has_id:
            raise _invalid("response must have id")
        return SuccessResponseEnvelope(id=value["id"], result=value["result"])

    if has_error and not has_result:
        err = value.get("error")
        if not isinstance(err, dict) or not isinstance(err.get("code"), int) or not isinstance(err.get("message"), str):
            raise _invalid("error must have numeric code + string message")
        rpc_id = value["id"] if has_id else None
        return ErrorResponseEnvelope(
            id=rpc_id,
            error={"code": err["code"], "message": err["message"], "data": err.get("data")},
        )

    raise _invalid("envelope must be request, notification, or response")


def build_request(full_method: str, params: Any, rpc_id: RpcId) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "method": full_method, "params": params, "id": rpc_id}


def build_notification(full_method: str, params: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "method": full_method, "params": params}


def build_success_response(rpc_id: RpcId, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "result": result}


def build_error_response(rpc_id: RpcId | None, code: int, message: str, data: Any = None) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message, "data": data}}
