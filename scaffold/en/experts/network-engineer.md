---
expert: network-engineer
name: Data-centre network engineer
appliesTo: Compute fabric, storage network, out-of-band management, multi-tenancy and cabling in AI data centres (AIDC)
jurisdiction: not-specified (check the project network standards and vendor compatibility)
cardVersion: 1
updatedAt: 2026-11-11
sources:
  - Preset brief: compiled from general data-centre networking practice, not tied to one vendor; verify device compatibility and current standards before use
---

# Data-centre network engineer expert brief

> This brief is a **review lens**, not a network design or performance promise. `domain-expert` reviews the PRD / design / prototype against it; anything the brief does not cover is marked "not covered by the brief" — do not fill the gap by guessing.

## 1. What this profession looks at in this kind of product

- **Topology and oversubscription**: spine-leaf, leaf-spine bandwidth, oversubscription / oversell ratio, east-west traffic, inter-module links.
- **Protocols and congestion**: RoCEv2 / InfiniBand, PFC / ECN, lossless network, head-of-line blocking, multipathing.
- **Physical layer**: optics, fibre types, distance, cabling, patch panels, labelling and documentation.
- **Out-of-band management**: BMC / IPMI, management-network isolation, bastion hosts, auditing.
- **Multi-tenancy and security**: VLAN / VRF / VXLAN, tenant isolation, ACLs, east-west micro-segmentation.
- **Observability**: port / optical-power / drop / latency / congestion metrics, alarms and packet capture.

## 2. Review checklist (against PRD / design / prototype)

| # | Focus | What to look for | Basis | Common gap |
| --- | --- | --- | --- | --- |
| 1 | Topology and oversubscription | Oversubscription ratio, oversell, inter-module bandwidth | Design standards / traffic | "10G access" only; no oversubscription |
| 2 | Protocol choice | RoCEv2 vs IB, lossless tuning, PFC / ECN | Vendor standards / industry practice | RoCE deployed without lossless configuration |
| 3 | Physical layer | Optics / fibre / distance / cabling | GB 50311 / vendor requirements | Distance exceeded; incompatible modules |
| 4 | Out-of-band management | Management isolation, BMC coverage, auditing | Operations practice | Management and business traffic share a network |
| 5 | Multi-tenancy | VLAN / VRF / VXLAN, ACLs, isolation testing | Business / compliance | Logical isolation only, never verified |
| 6 | Observability | Drops / latency / optical power / congestion alarms | Operations practice | Only port up/down monitored |
| 7 | Change and expansion | Expansion path, cut-over window, rollback | Operations practice | No rollback; cut-over becomes an incident |

## 3. Red lines and licensed boundary

- **Must be confirmed by a network architect / vendor support**: protocol choice, lossless parameters, compatibility, cut-over plan.
- **AI must not conclude**: never write "non-blocking / zero loss / meets latency"; write "under condition X it should…, to be confirmed by measurement".
- **Cost of missing it**: training jobs starved by the network, tenant traffic leakage, cut-over outage, no data for troubleshooting.

## 4. Common basis (examples; verify the current version)

- TIA-942: data-centre network and cabling topology.
- GB 50311 "Code for design of generic cabling systems": cabling, distance, labelling.
- InfiniBand Trade Association (IBTA) / RoCEv2 implementation standards: lossless, congestion control.
- IEEE 802.3: Ethernet physical layer and rates.

## 5. Output requirements

- Every `E-N` carries "basis + source + date + applicable vendor / edition"; without a source, mark "practitioner judgement (unverified)".
- Uncertain items go into "questions for a licensed professional" — do not guess.
- The conclusion is only `no professional blocker` / `reservations` / `release after professional confirmation`.
