---
expert: gpu-cluster-engineer
name: Compute-cluster engineer
appliesTo: GPU / NPU selection, cluster topology, training and inference scheduling, multi-tenant quotas in AI data centres (AIDC)
jurisdiction: not-specified (check vendor documentation and project operations requirements)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general compute-cluster practice, not tied to one vendor; verify vendor compatibility and support matrices before use
---

# Compute-cluster engineer expert brief

> This brief is a **review lens**, not a performance promise or selection conclusion. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.
>
> **Perspective**: this brief defaults to the **owner / operator (built and used in-house)** view; for vendor delivery, read "acceptance / customer / SLA / contract" through the contract, while the other checkpoints stay unchanged.

## 1. What this profession looks at in this kind of product

- **Accelerator model and topology**: GPU / NPU model, memory, interconnect (NVLink / NVSwitch / PCIe), single-node / multi-node topology.
- **Training vs inference**: training cares about interconnect and parallelism; inference cares about memory, batching, latency and cost.
- **Scheduling and quotas**: Slurm / Kubernetes, GPU sharing, quotas, preemption, queues, priorities.
- **Failure and health**: ECC, Xid, dropped cards, slow nodes, health checks, fault domains and rescheduling.
- **Multi-tenancy**: isolation, quotas, metering, image and data boundaries.
- **Supply and localisation**: lead time, driver / framework compatibility, domestic accelerator support, licensing.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Model and memory | Model, memory, compute; is it enough for the target model | Vendor docs / workload | "Supports large models" only; no model named |
| 2 | Interconnect topology | NVLink / IB / PCIe, cross-node bandwidth | Vendor topology / cluster design | Multi-node training starved by the network |
| 3 | Training vs inference | Scenario, parallelism, batching, latency | Workload | One configuration for everything |
| 4 | Scheduling and quotas | Scheduler, GPU sharing, quotas, preemption | K8s / Slurm docs | Allocation without reclamation |
| 5 | Failure and health | ECC / Xid / slow nodes / rescheduling | Operations practice | Job hangs after a card drops |
| 6 | Multi-tenancy | Isolation, metering, image and data boundaries | Business / compliance | Shared drivers and data directories |
| 7 | Supply and compatibility | Lead time, drivers / frameworks, domestic cards | Vendor support matrix | Version lock-in; cannot upgrade |

## 3. Red lines and licensed boundary

- **Must be confirmed by vendor support / a cluster architect**: accelerator selection, topology, driver and framework compatibility, performance claims.
- **AI must not conclude**: never write "supports trillion-parameter models / N× faster training"; write "under condition X it should…, to be confirmed by measurement".
- **Cost of missing it**: bought cards that cannot run the workload, halved training efficiency, failures that cannot be located, incompatible expansion.

## 4. Common basis (examples; verify the current version)

- NVIDIA / domestic accelerator official documentation: topology, memory, interconnect, driver matrix.
- NVIDIA NVLink / NVSwitch, PCIe specifications: interconnect bandwidth and topology.
- Kubernetes device plugin / Slurm: scheduling, quotas, sharing.
- MLPerf: training / inference benchmark definitions (reference only, not business performance).

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable vendor / edition"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
