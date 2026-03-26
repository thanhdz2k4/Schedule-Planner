# Phase 9 - Personal Knowledge Vault (RAG)

## 1. Muc tieu

- Tra loi dung va co nguon thay vi tra loi mo ho.
- Ho tro workflow can du lieu dai han: note, docs, guideline, SOP.
- Giam hallucination trong query/workflow planning.

## 2. Van de hien tai

- `query_data` moi dung du lieu he thong, chua dung tri thuc ngoai.
- Cac cau hoi "tai lieu cua toi noi gi" chua co cach tra loi tot.
- Khong co citation de user verify.

## 3. Pham vi

Trong phase nay lam:

- Ingestion source: markdown, txt, pdf/link.
- Chunk + embedding + vector retrieval theo `user_id`.
- Context builder co citation block.
- API quan ly source/index status.

Chua lam:

- Fine-tune model rieng theo user.
- OCR nang cao cho scan phuc tap.

## 4. Kien truc de xuat

```text
Source Upload
  -> Parser + Chunker
  -> Embedding
  -> Vector Store (scoped by user)
  -> Retriever + Reranker
  -> Workflow/Reply with citation
```

## 5. Checklist

1. Tao `knowledge_sources`, `knowledge_chunks`.
2. Build ingestion worker va index queue.
3. Them retriever middleware cho query workflow.
4. Format response co citation `[source:title#chunk]`.
5. Dashboard source health + reindex.

## 6. KPI va tieu chi hoan thanh

- >= 70% cau hoi knowledge co citation hop le.
- Precision@5 retrieval dat target toi thieu 0.7.
- Latency retrieval giu trong SLA da dat.
