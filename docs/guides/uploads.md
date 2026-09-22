# Upload research and follow its progress

[Documentation](../README.md) / Uploads

## Submit a group of sources

1. Open **Sources and imports** in the dashboard.
2. Paste article URLs one per line, paste text, or select documents under **Add files**.
3. Keep one transcript per file where practical. Use descriptive filenames.
4. Select **Queue import** and wait for the accepted count for the whole selection.
5. Leave the page once acceptance is confirmed. Return to **Import activity** to check progress.

A group of 30 items fits the per-request count limit, but upload and processing time still depend on file sizes and provider availability. If submission stops halfway, check which items were accepted before resubmitting.

## Formats and limits

| Input | Current behaviour |
| --- | --- |
| DOC / DOCX | Server extracts text with antiword / mammoth. |
| PDF | Server extracts selectable text with pdftotext. Scans need OCR first. |
| TXT / MD / SRT / VTT | Imported as text research. |
| CSV | Imported as text, not one source per row. |
| Telegram JSON | Text-bearing messages become separate sources, retaining available sender/date/message metadata. |
| Article URL | Native resource acquisition attempts to retrieve the page. Private or paywalled content may fail. |

- Maximum file size: **5,000,000 bytes (5 MB)**.
- Maximum imported document text: **250,000 characters**.
- Maximum sources per server request: **100**. The UI batches larger selections.
- Encrypted, damaged, image-only or excessively complex documents can fail extraction.
- Audio/video transcription, OCR and ZIP imports are not installed upload features.

## Follow the correct stage

| Stage | Meaning | Next step if it fails |
| --- | --- | --- |
| Queued / importing | The import is accepted; retrieval or document extraction is pending. | Resolve the cause, then use Retry import. |
| Source retained | The source exists in the shared research workflow. Evidence analysis may still be pending. | Check evidence-processing status. |
| Evidence processed | Supported claims and dates have been extracted. | Inspect Topics or Timeline and open the source. |

Not every source contains a supported event date. Missing Timeline entries can be correct when the evidence is undated.

## Telegram input

Forward an individual item to the established Satoshi bot and explicitly ask to save it to Crypto Intelligence. Confirm the retained source on the website. Do not assume that saying “start batch” enables a dedicated collection mode; that interface is not part of the verified implementation.

For a history export, use Telegram Desktop's JSON export where available and upload `result.json`. Media-only messages need readable accompanying text or a transcript.
