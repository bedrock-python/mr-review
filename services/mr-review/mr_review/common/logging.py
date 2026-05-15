"""Structured logging configuration (inlined from service-observability)."""

from __future__ import annotations

import logging
import sys
from collections.abc import Callable
from typing import Any, TextIO

import orjson
import structlog

_RECURSIVE_MAX_DEPTH = 20


class SensitiveDataFilter:
    """Masks sensitive fields in log event dicts using an iterative stack."""

    def __init__(
        self,
        fields: frozenset[str] | set[str] | None = None,
        mask: str = "***",
        recursive: bool = True,
    ) -> None:
        self._fields: frozenset[str] = frozenset(fields) if fields else frozenset()
        self._mask = mask
        self._recursive = recursive

    def __call__(self, data: dict[str, Any]) -> dict[str, Any]:
        result = self._mask_any(data)
        return result if isinstance(result, dict) else data

    def _mask_any(self, data: Any) -> Any:
        if not isinstance(data, (dict, list)):
            return data

        result: dict[str, Any] | list[Any] = {} if isinstance(data, dict) else []
        stack: list[tuple[Any, Any, int]] = [(data, result, 0)]

        while stack:
            src, tgt, depth = stack.pop()
            if isinstance(src, dict):
                self._process_dict(src, tgt, depth, stack)
            elif isinstance(src, list):
                self._process_list(src, tgt, depth, stack)

        return result

    def _should_recurse(self, value: Any, depth: int) -> bool:
        return self._recursive and depth < _RECURSIVE_MAX_DEPTH and isinstance(value, (dict, list))

    def _process_dict(
        self,
        src: dict[str, Any],
        tgt: dict[str, Any],
        depth: int,
        stack: list[tuple[Any, Any, int]],
    ) -> None:
        for key, value in src.items():
            if key in self._fields:
                tgt[key] = self._mask
            elif not self._should_recurse(value, depth):
                tgt[key] = value
            elif isinstance(value, dict):
                new_dict: dict[str, Any] = {}
                tgt[key] = new_dict
                stack.append((value, new_dict, depth + 1))
            else:
                new_list: list[Any] = []
                tgt[key] = new_list
                stack.append((value, new_list, depth + 1))

    def _process_list(
        self,
        src: list[Any],
        tgt: list[Any],
        depth: int,
        stack: list[tuple[Any, Any, int]],
    ) -> None:
        tgt.extend([None] * len(src))
        for i, item in enumerate(src):
            if not self._should_recurse(item, depth):
                tgt[i] = item
            elif isinstance(item, dict):
                new_dict: dict[str, Any] = {}
                tgt[i] = new_dict
                stack.append((item, new_dict, depth + 1))
            else:
                new_list: list[Any] = []
                tgt[i] = new_list
                stack.append((item, new_list, depth + 1))


class _SecurityProcessor:
    """Structlog processor that delegates masking to SensitiveDataFilter."""

    def __init__(self, security_filter: SensitiveDataFilter) -> None:
        self._filter = security_filter

    def __call__(self, logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        return self._filter(event_dict)


def _orjson_dumps(data: object, **kwargs: Any) -> str:
    return orjson.dumps(data, **kwargs).decode("utf-8")


def _shared_processors() -> list[Any]:
    return [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.StackInfoRenderer(),
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.stdlib.ExtraAdder(),
        structlog.dev.set_exc_info,
        structlog.processors.EventRenamer("message", "event"),
    ]


def configure_logging(
    log_level: str = "INFO",
    use_json_format: bool = True,
    security_filter: SensitiveDataFilter | None = None,
    stream: TextIO | None = None,
    unify_external_loggers: list[str] | None = None,
    extra_processors: list[Any] | None = None,
    json_serializer: Callable[..., str] | None = None,
) -> None:
    """Configure structlog with shared processors and optional security masking."""
    level_int = getattr(logging, log_level.upper(), logging.INFO)

    processors = _shared_processors()
    if security_filter is not None:
        processors.append(_SecurityProcessor(security_filter))
    if extra_processors:
        processors.extend(extra_processors)

    serializer = json_serializer or _orjson_dumps

    structlog.configure(
        processors=[
            *processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    if use_json_format:
        formatter_tail: list[Any] = [
            structlog.processors.ExceptionRenderer(),
            structlog.processors.JSONRenderer(serializer=serializer),
        ]
    else:
        formatter_tail = [structlog.dev.ConsoleRenderer(event_key="message")]

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            structlog.processors.CallsiteParameterAdder(
                [
                    structlog.processors.CallsiteParameter.MODULE,
                    structlog.processors.CallsiteParameter.PATHNAME,
                    structlog.processors.CallsiteParameter.LINENO,
                    structlog.processors.CallsiteParameter.FUNC_NAME,
                ],
            ),
            *formatter_tail,
        ],
    )

    root_logger = logging.getLogger()
    root_logger.handlers.clear()
    handler = logging.StreamHandler(stream=stream or sys.stdout)
    handler.setFormatter(formatter)
    root_logger.addHandler(handler)
    root_logger.setLevel(level_int)

    for name in unify_external_loggers or []:
        ext = logging.getLogger(name)
        ext.handlers.clear()
        ext.propagate = True
