# Phase 16 - Eval Benchmark & Guardrail

## 1. Muc tieu

- Do chat luong AI workflow bang so lieu, khong cam tinh.
- Chan regression khi them workflow moi.
- Day safety gate truoc production rollout.

## 2. Pham vi

Trong phase nay lam:

- Golden dataset theo intent/workflow.
- Offline eval: intent accuracy, entity F1, workflow success.
- Online eval: user rating, retry rate, correction rate.
- Guardrail: prompt injection, unsafe action, privacy leak.

## 3. Dashboard metric de theo doi

- `intent_accuracy`
- `entity_extraction_f1`
- `workflow_success_rate`
- `clarification_rate`
- `user_correction_rate`
- `unsafe_action_block_count`

## 4. Checklist

1. Build eval runner cho nightly CI.
2. Tao release gate threshold cho metric chinh.
3. Alert khi metric vuot nguong xau.
4. Luu evaluation artifact theo version.

## 5. KPI va tieu chi hoan thanh

- Co benchmark baseline + target cho top workflows.
- Moi release deu co ket qua eval kem theo.
- Regression bat duoc truoc khi len production.
