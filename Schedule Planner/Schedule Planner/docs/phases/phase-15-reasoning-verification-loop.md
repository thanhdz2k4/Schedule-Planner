# Phase 15 - Reasoning & Verification Loop

## 1. Muc tieu

- Tang do dung workflow output, khong tra loi "hop ly nhung sai".
- Giam loi silent-failure khi model suy luan nham.
- Bat buoc verify truoc khi tra ket qua quan trong.

## 2. Kien truc loop

```text
Plan (reasoning draft)
  -> Execute (tool/workflow)
  -> Verify (rule + LLM critic)
  -> Finalize or Ask Clarification
```

## 3. Pham vi

Trong phase nay lam:

- `critic_step` cho workflow critical.
- Verification rules: date/time, overlap, missing dependency.
- Confidence threshold de quyet dinh auto-reply hay ask-back.
- Structured explanation "vi sao ket qua nay".

## 4. Checklist

1. Them `verify_output` step vao workflow templates.
2. Them `confidence_band`: high/medium/low.
3. Low confidence -> clarification thay vi execute tiep.
4. Log mismatch giua draft va verified output.

## 5. KPI va tieu chi hoan thanh

- Ty le output can user sua lai giam >= 25%.
- Critical workflow sai logic giam ro rang theo benchmark.
