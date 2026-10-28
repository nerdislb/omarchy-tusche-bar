#!/usr/bin/env python3
"""Read the signed-in Codex credit balance without making a model request.

Uses the installed Omarchy collector's CLI discovery and JSON-RPC transport.
Credentials stay with Codex. Only the display fields below leave the process.
"""
import datetime as dt
from decimal import Decimal, InvalidOperation
import json
import os
from pathlib import Path
import runpy
import subprocess
import tempfile


def snapshot(response):
    result = response.get("result")
    if response.get("error") or not isinstance(result, dict):
        raise ValueError("Credit snapshot unavailable")
    credits = (result.get("rateLimits") or {}).get("credits")
    if not isinstance(credits, dict):
        raise ValueError("Credit snapshot unavailable")
    if type(credits.get("hasCredits")) is not bool or type(credits.get("unlimited")) is not bool:
        raise ValueError("Invalid credit flags")
    balance = credits.get("balance")
    if balance is not None:
        if not isinstance(balance, str) or len(balance) > 40:
            raise ValueError("Invalid credit balance")
        try:
            amount = Decimal(balance)
        except InvalidOperation:
            raise ValueError("Invalid credit balance") from None
        if not amount.is_finite() or amount < 0 or amount > 1e12:
            raise ValueError("Invalid credit balance")
        balance = str(amount)
    if balance is None and not credits["unlimited"]:
        raise ValueError("Credit amount unavailable")
    return {"status": "ok", "balance": balance, "hasCredits": credits["hasCredits"],
            "unlimited": credits["unlimited"]}


def fetch():
    collector = Path(os.environ.get("OMARCHY_PATH", "/usr/share/omarchy")) / "bin/omarchy-agent-usage-codex"
    helpers = runpy.run_path(str(collector), run_name="credit_transport")
    cli = helpers["find_codex_binary"]()
    if not cli:
        raise RuntimeError("Codex unavailable")
    env = helpers["ENV"]
    home = Path(env.get("CODEX_HOME") or (Path.home() / ".codex"))
    if not helpers["has_codex_credentials"](home, env):
        raise RuntimeError("Codex signed out")
    # Never log stdout/stderr from Codex: they may contain account information.
    with subprocess.Popen([cli, "-s", "read-only", "-a", "on-request", "app-server"],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, text=True, env=env) as proc:
        try:
            helpers["rpc_request"](proc, 1, "initialize", {"clientInfo": {"name": "tusche-credits", "version": "1"}}, timeout=8)
            helpers["rpc_send"](proc, {"method": "initialized", "params": {}}, "initialized")
            return snapshot(helpers["rpc_request"](proc, 2, "account/rateLimits/read", timeout=8))
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()


def save(path, record):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=".credits-", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as file:
            json.dump(record, file)
            file.write("\n")
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main():
    try:
        record = fetch()
    except Exception:
        # Missing, failed and signed-out responses are unknown, never zero.
        record = {"status": "unavailable", "balance": None, "unlimited": False}
    record.update(schemaVersion=1, updatedAt=dt.datetime.now(dt.timezone.utc).isoformat())
    state = Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state")
    save(state / "tusche-bar/codex-credits.json", record)


if __name__ == "__main__":
    main()
