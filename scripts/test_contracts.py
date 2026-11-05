#!/usr/bin/env python3
"""Negative regression tests: schema and OpenAPI contract drift must fail CI."""
import copy
import unittest

from check_contracts import REQUIRED, load_cases, check_openapi, validate_fixture_semantics, CONTRACTS


class ContractTests(unittest.TestCase):
    def test_load_cases(self):
        cases = load_cases()
        self.assertEqual(len(cases["scenarios"]), 9)

    def test_required_routes(self):
        self.assertEqual(set(REQUIRED), {
            ("GET", "/health"), ("GET", "/plaintext"),
            ("GET", "/json"), ("POST", "/echo")})

    def test_invalid_openapi_missing_method(self):
        doc = {"paths": {}}
        with self.assertRaises(ValueError):
            check_openapi(doc)

    def test_schema_rejects_bad_status(self):
        from jsonschema import Draft202012Validator, ValidationError
        from check_contracts import CONTRACTS
        import json
        schema = json.loads((CONTRACTS / "cases.schema.json").read_text())
        cases = copy.deepcopy(load_cases())
        cases["scenarios"][0]["expected"]["status"] = "200"
        with self.assertRaises(ValidationError):
            Draft202012Validator(schema).validate(cases)

    def test_json_contract_fixture(self):
        cases = {c["id"]: c for c in load_cases()["scenarios"]}
        self.assertEqual(cases["health"]["expected"]["body"]["equals"], {"status": "ok"})
        self.assertEqual(cases["json"]["expected"]["body"]["equals"], {"message": "hello, world!"})


    def test_fixture_cannot_weaken_json_literal(self):
        cases = copy.deepcopy(load_cases())
        cases["scenarios"][0]["expected"]["body"]["equals"]["status"] = "ready"
        with self.assertRaisesRegex(ValueError, "payload literal"):
            validate_fixture_semantics(cases)

    def test_fixture_cannot_swap_routes(self):
        cases = copy.deepcopy(load_cases())
        cases["scenarios"][0]["path"] = "/json"
        with self.assertRaisesRegex(ValueError, "fixture drift"):
            validate_fixture_semantics(cases)

    def test_fixture_cannot_skip_oversized_body(self):
        cases = copy.deepcopy(load_cases())
        target = next(c for c in cases["scenarios"] if c["id"] == "echo-too-large")
        target["payload"]["repeat"] = 4096
        with self.assertRaisesRegex(ValueError, "binary boundary"):
            validate_fixture_semantics(cases)

    def test_openapi_requires_413_media_type(self):
        import json
        doc = json.loads((CONTRACTS / "generated/openapi.json").read_text())
        doc["paths"]["/echo"]["post"]["responses"]["413"]["content"] = {}
        with self.assertRaisesRegex(ValueError, "413"):
            check_openapi(doc)

    def test_openapi_requires_plaintext_literal(self):
        import json
        doc = json.loads((CONTRACTS / "generated/openapi.json").read_text())
        doc["paths"]["/plaintext"]["get"]["responses"]["200"]["content"]["text/plain; charset=utf-8"]["schema"]["enum"] = ["different"]
        with self.assertRaisesRegex(ValueError, "plaintext"):
            check_openapi(doc)

    def test_openapi_rejects_unexpected_status(self):
        import json
        doc = json.loads((CONTRACTS / "generated/openapi.json").read_text())
        doc["paths"]["/health"]["get"]["responses"]["201"] = {"description": "Created"}
        with self.assertRaisesRegex(ValueError, "status codes"):
            check_openapi(doc)

    def test_duplicate_canonical_ids_cannot_be_relabelled_into_success(self):
        cases = copy.deepcopy(load_cases())
        scenarios = cases["scenarios"]
        scenarios[1]["id"] = scenarios[0]["id"]
        with self.assertRaisesRegex(ValueError, "exact nine canonical IDs"):
            validate_fixture_semantics(cases)

    def test_unmodelled_get_request_payload_must_be_rejected(self):
        cases = copy.deepcopy(load_cases())
        health = next(c for c in cases["scenarios"] if c["id"] == "health")
        health["payload"] = {"byteRange": 256, "repeat": 0}
        with self.assertRaisesRegex(ValueError, "unexpected request body"):
            validate_fixture_semantics(cases)

    def test_openapi_inclusion_flag_is_exact(self):
        cases = copy.deepcopy(load_cases())
        probe = next(c for c in cases["scenarios"] if c["id"] == "not-found")
        probe["inOpenApi"] = True
        with self.assertRaisesRegex(ValueError, "OpenAPI inclusion"):
            validate_fixture_semantics(cases)

    def test_oversized_echo_must_retain_canonical_binary_boundary(self):
        cases = copy.deepcopy(load_cases())
        oversized = next(c for c in cases["scenarios"] if c["id"] == "echo-too-large")
        oversized["payload"]["byteRange"] = 128
        with self.assertRaisesRegex(ValueError, "binary boundary fixture"):
            validate_fixture_semantics(cases)

    def test_status_and_media_type_are_bound_to_each_named_probe(self):
        cases = copy.deepcopy(load_cases())
        health = next(c for c in cases["scenarios"] if c["id"] == "health")
        health["expected"]["headers"]["content-type"] = "text/plain"
        with self.assertRaisesRegex(ValueError, "media type"):
            validate_fixture_semantics(cases)


if __name__ == "__main__":
    unittest.main()
