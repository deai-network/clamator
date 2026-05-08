from __future__ import annotations

from typing import Any


class RpcError(Exception):
    """Application-defined JSON-RPC error. Throw from a handler to produce an error response."""

    def __init__(self, code: int, message: str, data: Any = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.data = data


class ClamatorProtocolError(Exception):
    """Validation failure or malformed envelope."""


class ClamatorTransportError(Exception):
    """Transport-level failure (connection lost, timeout, etc.)."""

    def __init__(self, message: str, *, cause: BaseException | None = None) -> None:
        super().__init__(message)
        if cause is not None:
            self.__cause__ = cause


_SERIALIZABLE = (str, int, float, bool, type(None))


def exception_to_error_data(err: BaseException) -> dict[str, Any]:
    out: dict[str, Any] = {"name": type(err).__name__, "message": str(err)}
    for k, v in vars(err).items():
        if k in {"args", "__cause__", "__context__", "__traceback__"}:
            continue
        if isinstance(v, _SERIALIZABLE):
            out[k] = v
        elif isinstance(v, list) and all(isinstance(x, _SERIALIZABLE) for x in v):
            out[k] = v
    return out
