# Satoshi and Crypto Intelligence User Guide

> Historical reference. For the current 22 September 2026 documentation, start with the [documentation index](../README.md). Verify older interface, release and authentication details before acting on them.


**Audience:** Mark and approved staff
**Reviewed:** 2026-08-10

## 1. Access checklist

### Browser applications

1. Open `https://forkedbrain.fyi/` or
   `https://crypto.forkedbrain.fyi/`.
2. Enter the exact email address that has been approved in Cloudflare Access.
3. Request the one-time code.
4. Enter the code from that email account.
5. If access is not granted, confirm that the exact email, including spelling,
   is present in the application policy.

### Satoshi in Telegram

1. Open Telegram.
2. Search for `@ForkedBrainSatoshi_Bot`.
3. Open the bot and tap **Start**, or send `/start`.
4. If there is no response, send your numeric Telegram ID to the system
   administrator so it can be added to the closed allowlist.
5. To find the numeric ID, message `@userinfobot`, tap **Start**, and copy the
   number it returns.

Do not send API keys, passwords, recovery codes, or other credentials to
Satoshi.

## 2. Using Satoshi naturally

Satoshi is one assistant. You do not need to select a mode. Examples:

- “What changed in crypto today that matters for my panel next week?”
- “What have we stored about Aave between June and August?”
- “Quiz me on the stablecoin research I saved.”
- “Prepare five talking points and likely objections.”
- “Create an X thread from the strongest evidence we have on this topic.”
- “Use the Creator Reference lens on this draft.”
- “Humanize this without changing any facts or links.”
- “Remember that I want to revisit this before the conference.”

Satoshi should use stored memory when it matters and fresh research when the
request requires current information. It should distinguish stored evidence,
fresh web information, and interpretation.

## 3. Saving information

### Save through Telegram

You can forward a link, file, transcript, or note to Satoshi. Helpful labels are:

- “Save this to Crypto Intelligence.”
- “This is Creator Reference material.”
- “Remember this generally.”

If the destination is obvious, Satoshi should route it automatically. If the
same material could belong to Crypto Intelligence or Creator Reference, it asks
one clarification.

Wait for Satoshi to confirm that native memory accepted the item and that the
Crypto source registration reached `ready`. A conversational acknowledgement
without those results is not proof of ingestion. Once ready, the source appears
under **Sources**, participates in dashboard full-text search, and is
eligible for the bounded ForkedBrain graph. Re-sending the same source returns
the existing record instead of duplicating it.

### Save through Dashboard Capture

Use Capture when you want the item to be visible and auditable in the dashboard:

1. Open `https://crypto.forkedbrain.fyi/`.
2. Select **Add source**.
3. Choose **URL** or **Pasted text**.
4. Add a clear title.
5. Paste the source and submit.
6. Wait for an accepted or duplicate receipt.
7. Open **Sources** and search for the title.

Capture rejects local/private addresses and unsafe URLs. When a social platform
blocks automated reading, paste the original text or transcript instead.

## 4. Dashboard guide

### Topics

Topics is the home screen. It shows themes already present in Mark's supplied
material. Search for a topic, filter for high-signal or recently discussed
topics, and open one to review its extracted claims and supporting sources.
This page does not invent watchlists, ratings, actions, or recommendations.

### Ask

Ask a focused question. Good questions include a topic, time range, comparison,
or decision. Every successful answer is saved in searchable question history.
Review the evidence shown with the answer. If the interface says
the intelligence plane is unavailable, treat the displayed corpus matches as
search results, not as a completed answer.

### Timeline

Use Timeline to understand when the underlying subject events occurred. The
year selector includes every year available in the corpus. The system
distinguishes unique events from dated references and identifies date
precision. Open an event to review what happened, why it matters, its source
context, and the original supporting record.

### Library

Use Sources to inspect material registered in the Crypto database. The visible
source types are Transcripts, Tweets, Blog posts, and Your notes. Open a source
to read its useful extracted summary, retained text when available, provenance,
events, and claims. The Ask this source panel limits the initial evidence scope
to that source.

### Quiz

1. Choose a topic or date range.
2. Generate a question set.
3. Answer in your own words.
4. Reveal a model answer when you want a comparison.
5. Review the score, explanation, and supporting evidence.
6. Use weak areas as follow-up questions in Ask.

### Studio

1. Choose the output: X post, X thread, LinkedIn post, review brief, or speaking prep.
2. Choose **Mark** or **Creator Reference** as the writing lens.
3. Enter a precise focus and optional date window.
4. Search and select up to 12 evidence sources, or leave the selection empty
   for bounded automatic selection.
5. Generate the draft.
6. Review every citation and factual claim.
7. Edit and save; revisions are preserved instead of overwriting the original.
8. Ask Satoshi to humanize the final draft only if desired.

Creator Reference changes expression, not evidence. If the reference corpus is
not available, the system should refuse to invent the creator's style.

### ForkedBrain memory graph

The graph shows a ranked, readable subset of structured memories. It is capped
at 20 nodes and may contain source, event, theme, draft, or conversation nodes.
Search filters this structured set. It does not show every semantic memory or
chat message.

## 5. Recommended daily workflow

1. Browse Topics or open the newest Sources.
2. Forward or Capture important new sources.
3. Ask Satoshi what changed and why it matters.
4. Save durable conclusions, not casual chat.
5. Use Quiz to test weak areas.
6. Use Speaking Preparation or Studio when an output is needed.
7. Review citations before publishing or presenting.

## 6. Troubleshooting

| Symptom | Meaning | Action |
|---|---|---|
| Cloudflare OTP never arrives | Email may not be allowed or mail is delayed | Confirm exact approved email and check spam |
| Satoshi does not respond | Telegram ID may not be allowlisted or gateway may be unavailable | Send numeric ID to administrator; then retry `/start` |
| Satoshi remembers a source but Library does not show it | Native ingestion completed but dashboard registration is still processing or failed | Wait for the final status; if it does not reach `ready`, send the title and time to the administrator for the queue receipt |
| Ask shows a degraded state | Hermes/provider connection is unavailable | Use exact search temporarily and notify the administrator |
| A source is rejected as duplicate | The same canonical source already exists | Open the existing Library item instead of re-adding it |
| X or Instagram link cannot be ingested | The platform blocked reliable extraction | Paste the source text and preserve the original URL |
| A generated draft cannot be saved | A citation or persistence validation failed | Regenerate or correct the evidence scope; do not remove citations blindly |
| Graph does not show a registered source by default | The graph shows only the 20 most relevant nodes | Search the graph by title or a distinctive term from the source |

## 7. Safety and quality rules

- Verify important numbers, dates, quotations, and source links.
- Treat Creator Reference as a style aid, not proof of authorship or endorsement.
- Do not paste secrets or private credentials into chat or Capture.
- Confirm before any destructive, public, financial, or externally consequential
  action.
- Report incorrect memory with an explicit correction and source.
- Keep the Library focused on durable intelligence rather than every message.
