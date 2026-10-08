#!/usr/bin/env python3
"""Verify TypeSpec-generated OpenAPI and runtime test fixtures agree, fail closed."""
import argparse
import json
from pathlib import Path
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[1]
CONTRACTS = ROOT / "contracts" / "conformance"
REQUIRED = {
    ("GET", "/health"): ("200", "application/json", "json"),
    ("GET", "/plaintext"): ("200", "text/plain; charset=utf-8", "utf8"),
    ("GET", "/json"): ("200", "application/json", "json"),
    ("POST", "/echo"): ("200", "application/octet-stream", "echo"),
}
MAX_ECHO = 1024 * 1024

# Fixed identities prevent edited fixtures from quietly relaxing the contract.
# TypeSpec is authoritative for OpenAPI; fixtures specify the concrete probes.
EXPECTED_SCENARIOS = {
    "health": ("GET", "/health", 200, "application/json", "json"),
    "plaintext": ("GET", "/plaintext", 200, "text/plain; charset=utf-8", "utf8"),
    "json": ("GET", "/json", 200, "application/json", "json"),
    "echo-empty": ("POST", "/echo", 200, "application/octet-stream", "echo"),
    "echo-binary": ("POST", "/echo", 200, "application/octet-stream", "echo"),
    "echo-64k": ("POST", "/echo", 200, "application/octet-stream", "echo"),
    "echo-1m": ("POST", "/echo", 200, "application/octet-stream", "echo"),
    "not-found": ("GET", "/not-found", 404, None, "ignore"),
    "echo-too-large": ("POST", "/echo", 413, "text/plain; charset=utf-8", "ignore"),
}
FIXED_BODIES = {
    "health": {"status": "ok"},
    "plaintext": "hello, world!",
    "json": {"message": "hello, world!"},
}
FIXED_REPEATS = {"echo-empty": 0, "echo-binary": 4, "echo-64k": 256,
                 "echo-1m": 4096, "echo-too-large": 4097}


def validate_fixture_semantics(data):
    """No silent weakening by renaming, swapping or modifying test cases."""
    cases = {item["id"]: item for item in data["scenarios"]}
    if len(cases) != len(data["scenarios"]) or set(cases) != set(EXPECTED_SCENARIOS):
        raise ValueError("conformance cases must contain the exact nine canonical IDs")
    for ident, (method, path, status, mime, kind) in EXPECTED_SCENARIOS.items():
        case = cases[ident]
        actual = case["expected"]
        if (case["method"], case["path"], actual["status"], actual["body"]["kind"]) != (
            method, path, status, kind
        ):
            raise ValueError(f"conformance fixture drift: {ident}")
        if case["inOpenApi"] != (ident != "not-found"):
            raise ValueError(f"incorrect OpenAPI inclusion: {ident}")
        if mime is not None and actual["headers"].get("content-type", "").lower() != mime:
            raise ValueError(f"incorrect response media type: {ident}")
        if ident in FIXED_BODIES and actual["body"].get("equals") != FIXED_BODIES[ident]:
            raise ValueError(f"expected payload literal changed: {ident}")
        if ident in FIXED_REPEATS:
            payload = case.get("payload", {})
            if payload.get("byteRange") != 256 or payload.get("repeat") != FIXED_REPEATS[ident]:
                raise ValueError(f"binary boundary fixture changed: {ident}")
        elif "payload" in case:
            raise ValueError(f"unexpected request body: {ident}")
    return True




def load_cases():
    schema = json.loads((CONTRACTS / "cases.schema.json").read_text())
    Draft202012Validator.check_schema(schema)
    data = json.loads((CONTRACTS / "cases.json").read_text())
    Draft202012Validator(schema).validate(data)
    result_schema = json.loads((CONTRACTS / "result.schema.json").read_text())
    Draft202012Validator.check_schema(result_schema)
    ids = [x["id"] for x in data["scenarios"]]
    if len(set(ids)) != len(ids):
        raise ValueError("duplicate scenario ID")
    seen = set()
    for case in data["scenarios"]:
        pair = (case["method"], case["path"])
        expected = case["expected"]
        if case["inOpenApi"]:
            if pair not in REQUIRED:
                raise ValueError(f"undeclared extra contract operation: {pair}")
            oversized = case.get("payload", {}).get("repeat") == 4097
            status, mime, kind = ("413", "text/plain; charset=utf-8", "ignore") if oversized else REQUIRED[pair]
            if str(expected["status"]) != status:
                raise ValueError(f"mismatched required status: {case['id']}")
            if expected["headers"].get("content-type", "").lower() != mime:
                raise ValueError(f"wrong required Content-Type: {case['id']}")
            if expected["body"]["kind"] != kind:
                raise ValueError(f"wrong required body type: {case['id']}")
            seen.add(pair)
        elif pair != ("GET", "/not-found") or expected["status"] != 404:
            raise ValueError(f"unexpected unmodeled scenario: {case['id']}")
        if case["method"] == "POST":
            if "payload" not in case:
                raise ValueError(f"missing binary fixture: {case['id']}")
            size = case["payload"]["byteRange"] * case["payload"]["repeat"]
            if size > MAX_ECHO and (size != MAX_ECHO + 256 or expected["status"] != 413):
                raise ValueError(f"unsupported oversize echo fixture: {case['id']}")
            if size <= MAX_ECHO and expected["status"] != 200:
                raise ValueError(f"in-range binary echo should succeed: {case['id']}")
        elif "payload" in case:
            raise ValueError(f"GET request must not carry payload: {case['id']}")
    if seen != set(REQUIRED):
        raise ValueError(f"missing required fixture operations: {set(REQUIRED) - seen}")
    if len(data["scenarios"]) != 9 or "not-found" not in ids or "echo-too-large" not in ids:
        raise ValueError("not-found, the 4 valid binary echoes, and oversize rejection are required")
    repeats = {x.get("payload", {}).get("repeat") for x in data["scenarios"] if x["method"] == "POST"}
    if repeats != {0, 4, 256, 4096, 4097}:
        raise ValueError(f"binary echo fixtures missing expected lengths: {repeats}")
    validate_fixture_semantics(data)
    return data


def check_openapi(doc):
    """Check operation presence AND the meaning of the emitted schemas."""
    paths = doc["paths"]
    actual = {(method.upper(), path) for path, item in paths.items()
              for method in item if method.lower() in
              ("get", "post", "put", "patch", "delete", "head", "options", "trace")}
    if actual != set(REQUIRED):
        raise ValueError(f"OpenAPI missing/extra routes: missing={set(REQUIRED)-actual}, extra={actual-set(REQUIRED)}")

    def response_schema(responses, code, media):
        response = responses.get(code)
        if not isinstance(response, dict):
            raise ValueError(f"Missing declared HTTP {code} response")
        contents = {key.lower(): value for key, value in response.get("content", {}).items()}
        value = contents.get(media.lower(), {})
        schema = value.get("schema")
        if not isinstance(schema, dict) or not schema:
            raise ValueError(f"HTTP {code} missing body schema for {media}")
        return schema

    defs = doc.get("components", {}).get("schemas", {})
    for (method, path), (status, mime, kind) in REQUIRED.items():
        operation = paths[path][method.lower()]
        responses = operation.get("responses", {})
        required_codes = {"200", "413"} if method == "POST" else {"200"}
        if set(responses) != required_codes:
            raise ValueError(f"{method} {path} changed declared status codes")
        schema = response_schema(responses, status, mime)
        if kind == "json":
            if "$ref" in schema:
                ref = schema["$ref"]
                if not ref.startswith("#/components/schemas/"):
                    raise ValueError(f"Unexpected external schema ref: {ref}")
                schema = defs.get(ref.rsplit("/", 1)[-1], {})
            key, literal = ("status", "ok") if path == "/health" else ("message", "hello, world!")
            prop = schema.get("properties", {}).get(key, {})
            if schema.get("type") != "object" or set(schema.get("required", [])) != {key}:
                raise ValueError(f"{path}: invalid required JSON object shape")
            if set(schema.get("properties", {})) != {key} or prop.get("enum") != [literal]:
                raise ValueError(f"{path}: JSON literal constraint changed")
        elif kind == "utf8":
            if schema.get("type") != "string" or schema.get("enum") != ["hello, world!"]:
                raise ValueError(f"{path}: plaintext response literal changed")
        elif kind == "echo":
            if schema.get("type") != "string" or schema.get("format") != "binary":
                raise ValueError("POST /echo must return raw binary bytes")
            request_body = operation.get("requestBody", {})
            if request_body.get("required") is not True:
                raise ValueError("POST /echo request body must be required")
            request_schema = request_body.get("content", {}).get("application/octet-stream", {}).get("schema", {})
            if request_schema.get("type") != "string" or request_schema.get("format") != "binary":
                raise ValueError("POST /echo must accept raw binary bytes")
            error = response_schema(responses, "413", "text/plain; charset=utf-8")
            if error.get("type") != "string":
                raise ValueError("HTTP 413 response must have a text body")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--openapi", type=Path, default=None)
    args = parser.parse_args()
    cases = load_cases()
    if args.openapi:
        check_openapi(json.loads(args.openapi.read_text()))
    print(json.dumps({"status": "ok", "scenarios": len(cases["scenarios"]),
                      "required_routes": len(REQUIRED), "compiled_openapi_checked": args.openapi is not None}))


if __name__ == "__main__":
    main()
