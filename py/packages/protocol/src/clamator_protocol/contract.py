from __future__ import annotations
from dataclasses import dataclass, field
from typing import Type

from pydantic import BaseModel


@dataclass(frozen=True)
class MethodEntry:
    """Runtime descriptor for a single method on a generated contract."""
    params_model: Type[BaseModel]
    result_model: Type[BaseModel] | None  # None for notifications
    handler_attr: str  # attribute on the service-instance to invoke (snake_case)


@dataclass(frozen=True)
class Contract:
    """Runtime descriptor for a service contract. Codegen emits one of these per service."""
    service: str
    methods: dict[str, MethodEntry] = field(default_factory=dict)
