# Phase 12 - Voice & Multimodal Workflow Input

## 1. Muc tieu

- Mo rong input de user khong can chi go text.
- Chuyen voice/image/document thanh workflow intent dung.
- Tang ti le "first-turn success" voi input phuc tap.

## 2. Van de hien tai

- User gui thong tin dai/phuc tap bang text rat kho chuan.
- Router mat nhieu turn clarification khi thieu context.
- Chua co cach parse attachment de tao workflow.

## 3. Pham vi

Trong phase nay lam:

- STT pipeline cho voice message.
- Parser cho image/doc co cau truc (lich, task list, checklist).
- Normalized multimodal payload -> router/workflow context.
- Reply song song text + optional audio.

Chua lam:

- Realtime streaming call full-duplex.

## 4. Kien truc de xuat

```text
Voice/Image/Doc
  -> Transcribe/Parse
  -> Normalize Entities
  -> Router + Workflow
  -> Text Reply (+ optional TTS)
```

## 5. Checklist

1. Tao endpoint ingest media.
2. Mapping parser output sang entity schema workflow.
3. Add confidence score cho parser result.
4. Clarification template rieng cho multimodal ambiguity.
5. Log cost theo media type.

## 6. KPI va tieu chi hoan thanh

- Ty le parse dung entity dat nguong da dat.
- Clarification turn trung binh giam o usecase media.
- Chi phi media processing trong budget.
