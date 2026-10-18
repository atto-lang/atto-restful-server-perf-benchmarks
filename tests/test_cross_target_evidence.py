import copy
import unittest
from scripts.validate_cross_target_evidence import InvalidEvidence, validate

DIGEST = "a" * 64
BASE = dict(schemaVersion=1,target="jvm",stage="JIT",status="PASS",
    workloadSha256=DIGEST,sourceTreeSha=DIGEST,artifactSha256=DIGEST,
    toolchain="GraalVM JDK 25",commandSha256=DIGEST,correctness="PASS",
    runs=5,metric={"name":"throughput","value":1234.5,"unit":"requests/s"},
    logSha256=DIGEST)

class AdmissionTests(unittest.TestCase):
    def reject(self, **changes):
        with self.assertRaises(InvalidEvidence):
            validate({**copy.deepcopy(BASE), **changes})
    def test_reproducible_software_evidence_shape(self):
        self.assertFalse(validate(copy.deepcopy(BASE))["crossTargetComparable"])
    def test_unknown_mixed_target_modes_rejected(self):
        self.reject(stage="SIMD128")
        self.reject(target="asic",stage="JIT")
        self.reject(artifactSha256="main")
    def test_not_run_cannot_report_synthetic_zero(self):
        self.reject(status="NOT_RUN",correctness="NOT_RUN",runs=0)
        self.assertEqual(validate({**BASE,"status":"UNSUPPORTED","correctness":"NOT_RUN",
                                   "runs":0,"metric":None})["outcome"],"UNSUPPORTED")
    def test_minimum_five_independent_runs_for_performance_claims(self):
        self.reject(runs=4)
        self.assertEqual(validate({**BASE,"runs":1,"metric":None})["outcome"],"PASS")
    def test_nan_boolean_and_mismatched_units_rejected(self):
        self.reject(metric={"name":"throughput","value":float("nan"),"unit":"requests/s"})
        self.reject(metric={"name":"throughput","value":True,"unit":"requests/s"})
        self.reject(metric={"name":"throughput","value":1,"unit":"mW"})
    def test_hardware_claim_cannot_be_relabeled_software_throughput(self):
        self.reject(target="asic",stage="CELL_MAPPED")

if __name__ == "__main__":
    unittest.main()
