"""MCP adapter over the canonical query layer — stdio JSON-RPC, standard library only.

**Same layer, no logic of its own.** Every fact this returns comes from `query.py`, which
is what makes `RULE-IDX-004`'s fact-level parity provable: the two adapters have nothing
to disagree about.

Why hand-rolled rather than the `mcp` SDK: ADR 0008 commits the index to zero third-party
dependencies so that clean-clone, offline and licence requirements hold by construction.
MCP over stdio is JSON-RPC 2.0, and the subset needed here — `initialize`, `tools/list`,
`tools/call` — is small and fully specified.

**Residual risk RISK-IDX-001:** this speaks the protocol as specified and is tested at the
JSON-RPC level, but it has not been exercised against a real MCP client from this
environment. The CLI is the path with no such caveat.

Run it with:  python3 tools/index/mcp_server.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import query  # noqa: E402

PROTOCOL_VERSION = "2024-11-05"
SERVER_INFO = {"name": "runway-index", "version": "1.0.0"}


def tool_definitions() -> list[dict]:
    """One MCP tool per canonical query, generated from the same registry the CLI uses."""
    tools = []
    for name, (_, description) in query.QUERIES.items():
        schema: dict = {"type": "object", "properties": {}, "required": []}
        if name != "violations":
            schema["properties"]["target"] = {
                "type": "string",
                "description": "a repository-relative file path, or a symbol name for `locate`/`similar`",
            }
            schema["required"].append("target")
        tools.append({"name": f"index_{name}", "description": description, "inputSchema": schema})
    return tools


def call_tool(name: str, arguments: dict) -> dict:
    short = name.removeprefix("index_")
    if short not in query.QUERIES:
        return {"error": f"unknown tool: {name}"}

    fn, _ = query.QUERIES[short]
    try:
        graph = query.load()
    except query.IndexUnavailable as exc:
        return {"error": str(exc)}

    if short == "violations":
        return fn(graph)

    target = arguments.get("target")
    if not target:
        return {"error": f"`{name}` requires a `target` argument"}
    return fn(graph, target)


def handle(request: dict) -> dict | None:
    method = request.get("method")
    request_id = request.get("id")

    if method == "initialize":
        result = {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": SERVER_INFO,
        }
    elif method in ("notifications/initialized", "initialized"):
        return None  # a notification: no response
    elif method == "tools/list":
        result = {"tools": tool_definitions()}
    elif method == "tools/call":
        params = request.get("params") or {}
        answer = call_tool(params.get("name", ""), params.get("arguments") or {})
        result = {
            "content": [{"type": "text", "text": json.dumps(answer, indent=2, sort_keys=True)}],
            "isError": "error" in answer,
        }
    elif method == "ping":
        result = {}
    else:
        return {
            "jsonrpc": "2.0",
            "id": request_id,
            "error": {"code": -32601, "message": f"method not found: {method}"},
        }

    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def serve(stdin=sys.stdin, stdout=sys.stdout) -> None:
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            stdout.write(
                json.dumps(
                    {
                        "jsonrpc": "2.0",
                        "id": None,
                        "error": {"code": -32700, "message": "parse error"},
                    }
                )
                + "\n"
            )
            stdout.flush()
            continue
        response = handle(request)
        if response is not None:
            stdout.write(json.dumps(response) + "\n")
            stdout.flush()


if __name__ == "__main__":
    serve()
