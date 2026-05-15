#!/usr/bin/env python3
"""Triton 算子合规性检查工具 - 通过 Claude Code CLI 调用 MiniMax-M2.5 判断算子实现是否合规."""

import argparse
import json
import logging
import os
import re
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None

logger = logging.getLogger(__name__)

SCRIPT_DIR = Path(__file__).parent.absolute()


def load_dotenv(env_path: str = None):
    if env_path is None:
        env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
        if not os.path.exists(env_path):
            env_path = "/workspace/auto_gen/.env"
    if not os.path.exists(env_path):
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, val = line.partition("=")
                key, val = key.strip(), val.strip()
                if val and val[0] in ('"', "'") and val[-1] == val[0]:
                    val = val[1:-1]
                if key:
                    os.environ[key] = val


def load_config(config_path: str) -> dict:
    if yaml is None:
        print("Error: pyyaml required. Install with: pip install pyyaml")
        sys.exit(1)
    with open(config_path) as f:
        return yaml.safe_load(f)


def scan_operators(config: dict) -> list[dict]:
    """Scan operator files based on config. Returns list of {name, file, vendor, path}."""
    flaggems_dir = Path(config["flaggems_dir"])
    worktree = config.get("worktree", "")
    base = flaggems_dir / worktree if worktree else flaggems_dir
    scan_cfg = config.get("scan", {})
    operators = []

    # NVIDIA ops
    if scan_cfg.get("nvidia_ops", True):
        ops_dir = base / "src" / "flag_gems" / "ops"
        if ops_dir.is_dir():
            for f in sorted(ops_dir.glob("*.py")):
                if f.name.startswith("__"):
                    continue
                operators.append({
                    "name": f.stem,
                    "file": str(f.relative_to(base)),
                    "vendor": "nvidia",
                    "path": str(f),
                })

    # Backend vendors
    backends_cfg = scan_cfg.get("backends", [])
    backend_dir = base / "src" / "flag_gems" / "runtime" / "backend"
    if backend_dir.is_dir():
        for vendor_dir in sorted(backend_dir.iterdir()):
            if not vendor_dir.is_dir() or vendor_dir.name.startswith("__"):
                continue
            if backends_cfg and vendor_dir.name not in backends_cfg:
                continue
            ops_subdir = vendor_dir / "ops"
            if not ops_subdir.is_dir():
                continue
            for f in sorted(ops_subdir.glob("*.py")):
                if f.name.startswith("__"):
                    continue
                operators.append({
                    "name": f.stem,
                    "file": str(f.relative_to(base)),
                    "vendor": vendor_dir.name.strip("_"),
                    "path": str(f),
                })

    return operators


def render_prompt(template_path: str, operator: dict) -> str:
    """Render the prompt template with operator info and source code."""
    with open(template_path) as f:
        template = f.read()
    with open(operator["path"]) as f:
        source = f.read()

    replacements = {
        "{{OPERATOR}}": operator["name"],
        "{{VENDOR}}": operator["vendor"],
        "{{FILE_PATH}}": operator["file"],
        "{{SOURCE_CODE}}": source,
    }
    for key, val in replacements.items():
        template = template.replace(key, val)
    return template


def ensure_cc_config(env: dict) -> str:
    """Create isolated Claude Code config dir. Returns config dir path."""
    cc_config_dir = str(SCRIPT_DIR / ".claude_config")
    os.makedirs(cc_config_dir, exist_ok=True)
    settings_path = os.path.join(cc_config_dir, "settings.json")
    settings = {
        "env": {},
        "skipDangerousModePermissionPrompt": True,
        "skipWebFetchPreflight": True,
    }
    for key in ("ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL",
                "ANTHROPIC_API_KEY", "CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS"):
        val = env.get(key)
        if val:
            settings["env"][key] = val
    with open(settings_path, "w") as f:
        json.dump(settings, f, indent=2)
    return cc_config_dir


def launch_check(operator: dict, config: dict, template_path: str, log_dir: str) -> subprocess.Popen:
    """Launch a Claude Code CLI process to check one operator."""
    prompt = render_prompt(template_path, operator)
    claude_cfg = config.get("claude", {})

    env = os.environ.copy()
    env.pop("CLAUDECODE", None)
    env["IS_SANDBOX"] = "1"

    cc_config_dir = ensure_cc_config(env)
    env["CLAUDE_CONFIG_DIR"] = cc_config_dir

    claude_bin = claude_cfg.get("bin", "claude")
    cmd = [
        claude_bin,
        "-p", prompt,
        "--dangerously-skip-permissions",
        "--output-format", "stream-json",
        "--verbose",
    ]

    model = claude_cfg.get("model")
    if model:
        cmd.extend(["--model", model])

    stdout_path = os.path.join(log_dir, f"{operator['vendor']}_{operator['name']}.jsonl")
    stderr_path = os.path.join(log_dir, f"{operator['vendor']}_{operator['name']}.log")

    stdout_file = open(stdout_path, "w")
    stderr_file = open(stderr_path, "w")

    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(SCRIPT_DIR),
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=stdout_file,
            stderr=stderr_file,
            start_new_session=True,
        )
    except Exception:
        stdout_file.close()
        stderr_file.close()
        raise

    proc._stdout_path = stdout_path
    proc._stderr_path = stderr_path
    proc._stdout_file = stdout_file
    proc._stderr_file = stderr_file
    proc._operator = operator

    logger.info(f"Launched check for {operator['vendor']}/{operator['name']} (PID={proc.pid})")
    return proc


def kill_process(proc: subprocess.Popen):
    try:
        pgid = os.getpgid(proc.pid)
        os.killpg(pgid, signal.SIGKILL)
    except (ProcessLookupError, OSError):
        try:
            proc.kill()
        except OSError:
            pass
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    proc._stdout_file.close()
    proc._stderr_file.close()


def parse_result(proc: subprocess.Popen) -> dict:
    """Parse the LLM judgment from stream-json output."""
    operator = proc._operator
    try:
        proc._stdout_file.close()
        proc._stderr_file.close()
    except Exception:
        pass

    result_text = ""
    try:
        with open(proc._stdout_path, "r", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "result":
                    result_text = event.get("result", "")
                    break
    except Exception as e:
        logger.warning(f"Failed to read output for {operator['name']}: {e}")

    if result_text:
        # Try to extract JSON from code block
        json_match = re.search(r"```json\s*(\{.*?\})\s*```", result_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        # Try to find raw JSON object
        json_match = re.search(r"\{[^{}]*\"pass\"[^{}]*\}", result_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        # Try more permissive: find any JSON with "pass" key
        json_match = re.search(r"\{.*?\"pass\"\s*:.*?\}", result_text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

    return {
        "pass": None,
        "reason": "Failed to parse LLM output",
        "has_triton_kernel": None,
        "torch_compute_calls": [],
        "violations": [],
        "_parse_error": True,
        "_raw_output": result_text[:500] if result_text else "",
    }


def run(args):
    """Main orchestration loop."""
    config_path = args.config or str(SCRIPT_DIR / "config.yaml")
    config = load_config(config_path)
    claude_cfg = config.get("claude", {})

    max_concurrent = claude_cfg.get("max_concurrent", 4)
    timeout = claude_cfg.get("timeout", 120)
    template_path = str(SCRIPT_DIR / "prompt_template.md")
    output_dir = SCRIPT_DIR / config.get("output_dir", "results")
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_dir = str(output_dir / f"logs_{timestamp}")
    os.makedirs(log_dir, exist_ok=True)

    # Scan operators
    operators = scan_operators(config)
    if args.operator:
        operators = [op for op in operators if op["name"] in args.operator]
    if args.vendor:
        operators = [op for op in operators if op["vendor"] in args.vendor]
    if args.limit:
        operators = operators[:args.limit]

    if not operators:
        logger.error("No operators to check. Verify config and filters.")
        return

    logger.info(f"Scanning {len(operators)} operators, max_concurrent={max_concurrent}")

    # Results
    results = []
    queue = list(operators)
    running: dict[str, tuple] = {}  # key -> (proc, start_time)
    shutdown = False

    def signal_handler(sig, frame):
        nonlocal shutdown
        if shutdown:
            os._exit(1)
        shutdown = True
        logger.warning(f"Shutdown requested, killing {len(running)} processes...")

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    while (queue or running) and not shutdown:
        # Launch new processes
        while queue and len(running) < max_concurrent and not shutdown:
            op = queue.pop(0)
            key = f"{op['vendor']}_{op['name']}"
            try:
                proc = launch_check(op, config, template_path, log_dir)
                running[key] = (proc, time.time())
            except Exception as e:
                logger.error(f"Failed to launch check for {key}: {e}")
                results.append({
                    "operator": op["name"],
                    "file": op["file"],
                    "vendor": op["vendor"],
                    "pass": None,
                    "reason": f"Launch failed: {e}",
                    "violations": [],
                })

        # Check running processes
        for key in list(running.keys()):
            proc, start_time = running[key]

            # Timeout check
            if timeout and proc.poll() is None and time.time() - start_time > timeout:
                logger.warning(f"[TIMEOUT] {key} after {timeout}s")
                kill_process(proc)
                del running[key]
                op = proc._operator
                results.append({
                    "operator": op["name"],
                    "file": op["file"],
                    "vendor": op["vendor"],
                    "pass": None,
                    "reason": f"Timeout after {timeout}s",
                    "violations": [],
                })
                continue

            if proc.poll() is not None:
                del running[key]
                op = proc._operator
                judgment = parse_result(proc)
                result_entry = {
                    "operator": op["name"],
                    "file": op["file"],
                    "vendor": op["vendor"],
                    "pass": judgment.get("pass"),
                    "reason": judgment.get("reason", ""),
                    "has_triton_kernel": judgment.get("has_triton_kernel"),
                    "torch_compute_calls": judgment.get("torch_compute_calls", []),
                    "violations": judgment.get("violations", []),
                }
                if judgment.get("_parse_error"):
                    result_entry["_parse_error"] = True
                    result_entry["_raw_output"] = judgment.get("_raw_output", "")

                status = "PASS" if judgment.get("pass") else "FAIL" if judgment.get("pass") is False else "ERROR"
                logger.info(f"[{status}] {op['vendor']}/{op['name']}: {judgment.get('reason', '')[:80]}")
                results.append(result_entry)

        if running:
            time.sleep(2)

    # Handle shutdown
    if shutdown:
        for key, (proc, _) in running.items():
            kill_process(proc)

    # Generate report
    pass_count = sum(1 for r in results if r["pass"] is True)
    fail_count = sum(1 for r in results if r["pass"] is False)
    error_count = sum(1 for r in results if r["pass"] is None)

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "config": {
            "flaggems_dir": config["flaggems_dir"],
            "model": claude_cfg.get("model", ""),
            "max_concurrent": max_concurrent,
            "timeout": timeout,
        },
        "summary": {
            "total": len(results),
            "pass": pass_count,
            "fail": fail_count,
            "error": error_count,
        },
        "results": results,
    }

    report_path = str(output_dir / f"report_{timestamp}.json")
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    logger.info(f"\nDone: {len(results)} total, {pass_count} pass, {fail_count} fail, {error_count} error")
    print(f"\nReport saved to: {report_path}")

    # Print summary of failures
    failures = [r for r in results if r["pass"] is False]
    if failures:
        print(f"\n--- FAILURES ({len(failures)}) ---")
        for r in failures:
            print(f"  {r['vendor']}/{r['operator']}: {r['reason']}")


def main():
    parser = argparse.ArgumentParser(description="Triton 算子合规性检查工具")
    parser.add_argument("-c", "--config", help="Path to config.yaml")
    parser.add_argument("-o", "--operator", nargs="*", help="Only check specific operator(s)")
    parser.add_argument("--vendor", nargs="*", help="Only check specific vendor(s)")
    parser.add_argument("--limit", type=int, help="Limit number of operators to check")
    parser.add_argument("-v", "--verbose", action="store_true", help="Enable debug logging")
    args = parser.parse_args()

    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%H:%M:%S",
    )

    load_dotenv()
    run(args)


if __name__ == "__main__":
    main()
