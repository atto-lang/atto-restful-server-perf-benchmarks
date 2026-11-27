#!/usr/bin/env python3
"""Linux host-only sampling of a benchmark server process group."""
import argparse
import json
import os
from pathlib import Path
import signal
import time


def parse_stat(raw):
    # comm can contain spaces and parentheses; all numeric fields follow its last ).
    head, sep, tail = raw.rpartition(')')
    if not sep or '(' not in head:
        raise ValueError('malformed proc stat')
    pid = int(head.split('(', 1)[0].strip())
    fields = tail.split()
    if len(fields) < 22:
        raise ValueError('truncated proc stat')
    return {'pid': pid, 'group': int(fields[2]), 'start_ticks': int(fields[19]),
            'user_ticks': int(fields[11]), 'system_ticks': int(fields[12]),
            'rss_pages': max(0, int(fields[21]))}


def snapshot(group, proc=Path('/proc')):
    members = []
    for path in proc.iterdir():
        if not path.name.isdecimal():
            continue
        try:
            record = parse_stat((path / 'stat').read_text())
        except (FileNotFoundError, ProcessLookupError, PermissionError, ValueError, UnicodeError):
            # Processes may exit during enumeration; this is a sampled observation.
            continue
        if record['group'] == group and record['pid'] == int(path.name):
            members.append(record)
    return sorted(members, key=lambda p: p['pid'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('group', type=int)
    parser.add_argument('--interval', type=float, default=1.0)
    args = parser.parse_args()
    if args.group <= 1 or not 0.1 <= args.interval <= 10:
        parser.error('group must exceed 1 and interval must be between 0.1 and 10 seconds')
    running = True
    def stop(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    start = time.monotonic_ns()
    print(json.dumps({'type': 'metadata', 'group': args.group,
                      'ticks_per_second': os.sysconf('SC_CLK_TCK'),
                      'page_bytes': os.sysconf('SC_PAGE_SIZE'),
                      'interval_seconds': args.interval,
                      'scope': 'sampled process group; summed RSS double counts shared pages; exited tasks may be missed'}), flush=True)
    while running:
        members = snapshot(args.group)
        print(json.dumps({'type': 'sample', 'elapsed_ns': time.monotonic_ns() - start,
                          'members': members}), flush=True)
        if not members:
            break
        time.sleep(args.interval)


if __name__ == '__main__':
    main()
