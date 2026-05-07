import random
from dataclasses import dataclass


@dataclass
class ExpBackoff:
    initial_ms: int
    max_ms: int
    factor: float = 2.0
    jitter: bool = True
    _current_ms: int | None = None

    def next_delay_ms(self) -> int:
        if self._current_ms is None:
            self._current_ms = self.initial_ms
        value = self._current_ms
        self._current_ms = min(self.max_ms, int(self._current_ms * self.factor))
        if self.jitter:
            return int(value * (0.5 + random.random() * 0.5))
        return value

    def reset(self) -> None:
        self._current_ms = None
