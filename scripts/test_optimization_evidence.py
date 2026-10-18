import copy
import unittest
from check_optimization_evidence import Rejected, validate

BASE = dict(
 schema_version=1, target="graal-native-pgo", stage="UNSUPPORTED",
 source_commit="a"*40, workload_sha256="b"*64, toolchain="GraalVM 25.x / native-image",
 flags=["-O2"], correctness_passed=False, repetitions=0, metrics={},
 artifacts={}, reason="edition/CLI lacks tested PGO support",
)


class OptimizationEvidenceTests(unittest.TestCase):
 def fail_if_accepted(self, **changes):
  item=copy.deepcopy(BASE)
  item.update(changes)
  with self.assertRaises(Rejected):
   validate(item)

 def test_unsupported_is_not_success(self):
  self.assertTrue(validate(copy.deepcopy(BASE))["accepted"])
  self.fail_if_accepted(reason="")
  self.fail_if_accepted(metrics={"p50_ms":0})
  self.fail_if_accepted(correctness_passed=True)

 def test_exact_source_and_workload_hashes(self):
  self.fail_if_accepted(source_commit="main")
  self.fail_if_accepted(workload_sha256="nonsense")
  self.fail_if_accepted(flags=[True])

 def test_software_measurement_requires_multiple_repetitions(self):
  record=dict(BASE,stage="SOFTWARE_MEASURED",correctness_passed=True,
   repetitions=5,reason="",metrics=dict(p50_ms=1,p95_ms=2,p99_ms=3,
   throughput_ops_per_sec=100),artifacts={"raw_runs":"f"*64})
  self.assertTrue(validate(record)["accepted"])
  self.fail_if_accepted(**{**record, "repetitions":4})
  self.fail_if_accepted(**{**record, "artifacts":{}})
  self.fail_if_accepted(**{**record, "metrics":dict(p50_ms=4,p95_ms=2,p99_ms=3,
    throughput_ops_per_sec=100)})

 def test_place_and_route_not_board_measurement(self):
  stage=dict(BASE,target="fpga-rtl",stage="PLACED_ROUTED",
             correctness_passed=True,artifacts={"pnr_log":"c"*64},reason="")
  self.assertTrue(validate(stage)["accepted"])
  self.fail_if_accepted(**{**stage,"metrics":{"board_measured_ops_per_sec":42}})
  stage["stage"]="HARDWARE_MEASURED"
  self.fail_if_accepted(**stage)

 def test_asic_estimate_not_measured_power(self):
  stage=dict(BASE,target="asic-rtl",stage="ASIC_PPA_ESTIMATE",reason="",
             correctness_passed=True,
             artifacts={"mapped_netlist":"c"*64,"timing_log":"d"*64})
  self.assertTrue(validate(stage)["accepted"])
  self.fail_if_accepted(**{**stage,"metrics":{"measured_watts":1}})

 def test_no_nan_or_booleans(self):
  self.fail_if_accepted(metrics={"p50_ms":float("nan")})
  self.fail_if_accepted(metrics={"p50_ms":True})


if __name__=="__main__":
 unittest.main()
