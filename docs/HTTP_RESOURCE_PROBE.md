# Optional process-group resource observations

Set ATTO_BENCH_RESOURCE_SAMPLE=1 on Linux to collect a separate JSONL stream
per target after readiness and through its conformance and timed workloads.
The external Python sampler records per-process identity (PID and start ticks),
cumulative user/system ticks and resident pages, along with clock/page units.
The server shell and its JVM child are included in the same process group.

This is a diagnostic, not an allocation profiler. Summed RSS double counts
shared pages; polling can miss short-lived tasks and exited processes, and
these whole-session samples are not phase-aligned or CPU/request measurements.
The sampler also competes for host CPU. Keep uninstrumented throughput
comparisons separate and do not infer exact peak RSS, retained heap, or
allocator bytes/op. The runner treats missing or failed sampling as failure.
The normal runner is unchanged when sampling is disabled.

The dedicated workflow compares current Spin shared/isolated pooled with
Vert.x on the same JDK; later work can derive phase-aligned resource reports
and add JFR or runtime allocation instrumentation.
