"""Shared guardrails for LLM-driven agent steps."""

from __future__ import annotations

import json
import os
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from typing import Any

from langchain_ollama import ChatOllama


def build_ollama_llm(temperature: float = 0.3, num_predict: int = 4096) -> ChatOllama:
    """Create a ChatOllama client from environment settings."""
    return ChatOllama(
        model=os.environ.get("OLLAMA_MODEL", "glm4:latest"),
        base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"),
        temperature=temperature,
        num_predict=num_predict,
    )


def clean_json_block(text: str) -> str:
    """Extract JSON text when response is wrapped in markdown code fences."""
    text = (text or "").strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    return text.strip()


def invoke_llm_json(llm: Any, messages: list[Any], timeout_seconds: int = 40) -> tuple[dict, str]:
    """
    Invoke an LLM and parse JSON output with timeout protection.

    Returns (parsed_json, cleaned_raw_text).
    """

    def _run_invoke():
        return llm.invoke(messages)

    executor = ThreadPoolExecutor(max_workers=1)
    future = executor.submit(_run_invoke)
    try:
        response = future.result(timeout=timeout_seconds)
    except FutureTimeoutError as exc:
        future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        raise TimeoutError(f"LLM timeout after {timeout_seconds}s") from exc
    except Exception:
        executor.shutdown(wait=False, cancel_futures=True)
        raise
    else:
        executor.shutdown(wait=False)

    raw_content = clean_json_block(getattr(response, "content", ""))
    if not raw_content:
        raise ValueError("LLM returned empty response")

    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError as exc:
        raise ValueError("LLM response was not valid JSON") from exc

    if not isinstance(parsed, dict):
        raise ValueError("LLM JSON response must be an object")

    return parsed, raw_content
