import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

PATH = Path(__file__).with_name('resource-sample.py')
spec = importlib.util.spec_from_file_location('resource_sample', PATH)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


def fake(pid=123, group=456, comm='name ) with spaces', rss=7):
    fields = ['S'] + ['0'] * 21
    for i, v in {2: group, 11: 17, 12: 5, 19: 998, 21: rss}.items():
        fields[i] = str(v)
    return f'{pid} ({comm}) ' + ' '.join(fields)


class SampleTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(mod.parse_stat(fake()), {'pid': 123, 'group': 456, 'start_ticks': 998,
                         'user_ticks': 17, 'system_ticks': 5, 'rss_pages': 7})

    def test_invalid(self):
        for raw in ['garbage', '123 (abc) S 0', fake().replace('998', 'abc')]:
            with self.assertRaises(ValueError):
                mod.parse_stat(raw)

    def test_negative_rss(self):
        self.assertEqual(mod.parse_stat(fake(rss=-1))['rss_pages'], 0)

    def test_snapshot_membership(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for pid, group in [(123, 456), (124, 456), (125, 457)]:
                (root / str(pid)).mkdir()
                (root / str(pid) / 'stat').write_text(fake(pid, group))
            (root / '126').mkdir()
            self.assertEqual([p['pid'] for p in mod.snapshot(456, root)], [123, 124])

    def test_real_group_and_child(self):
        code = 'import subprocess,sys,time; p=subprocess.Popen([sys.executable,"-c","import time;time.sleep(5)"]); print(p.pid,flush=True); p.wait()'
        with subprocess.Popen([sys.executable, '-c', code], start_new_session=True, stdout=subprocess.PIPE, text=True) as server:
            child = int(server.stdout.readline())
            try:
                with subprocess.Popen([sys.executable, str(PATH), str(server.pid), '--interval', '0.1'], stdout=subprocess.PIPE, text=True) as sampler:
                    metadata = json.loads(sampler.stdout.readline())
                    sample = json.loads(sampler.stdout.readline())
                    self.assertEqual(metadata['type'], 'metadata')
                    self.assertGreater(metadata['ticks_per_second'], 0)
                    self.assertGreater(metadata['page_bytes'], 0)
                    self.assertEqual({p['pid'] for p in sample['members']}, {server.pid, child})
                    sampler.terminate()
                    self.assertEqual(sampler.wait(timeout=3), 0)
            finally:
                import os, signal
                os.killpg(server.pid, signal.SIGTERM)
                server.wait(timeout=3)

    def test_invalid_group(self):
        result = subprocess.run([sys.executable, str(PATH), '1'], capture_output=True, text=True, timeout=3)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(result.stdout, '')


if __name__ == '__main__':
    unittest.main()
