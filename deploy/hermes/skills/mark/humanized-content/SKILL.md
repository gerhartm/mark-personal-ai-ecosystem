---
name: humanized-content
description: Apply a restrained final writing pass to outward-facing content so it sounds natural while preserving facts, citations, links, quotations, and intended voice. Use for X, LinkedIn, speaking material, presentations, newsletters, and polished public copy. Do not use for research answers, internal analysis, evidence records, or citations.
---

# Humanized Content

Apply this only after the factual draft is complete. It is an invisible output finalizer, not a navigation item, agent, memory source, or factual reasoning layer.

Hermes already includes the native `humanizer` skill. Use its surface principles, then apply the limited structural checks below. Do not run a broad rewrite that changes meaning.

## Non-negotiable preservation

Keep these exact:

- facts and causal claims
- numbers, dates, prices, and percentages
- quotations and speaker attribution
- URLs and Markdown links
- canonical citation IDs inside square brackets
- named entities, product names, and technical terms
- the requested channel, audience, length, and call to action

If naturalness conflicts with factual fidelity, preserve fidelity.

## Surface pass

- Remove inflated significance, vague authority, hype, filler, and generic conclusions.
- Prefer direct verbs and concrete nouns.
- Vary sentence length naturally.
- Remove repetitive rule-of-three constructions and formulaic contrasts.
- Avoid em dashes, emoji decoration, robotic headings, and chat-assistant framing.
- Keep the intended voice. Do not flatten a strong opinion into neutral corporate prose.

## Structural pass

Use only for longer content such as LinkedIn posts, speaking material, presentations, or newsletters. Choose at most one or two relevant interventions:

- State the main point once and remove repeated takeaways.
- Replace vague references with real names, dates, or numbers already present in the source evidence.
- Cut the wrap-up paragraph when the piece has already landed.
- Vary the structure from recent outputs rather than forcing every piece into the same arc.
- Leave genuine uncertainty unresolved when the evidence is unresolved.

For short X posts, use the surface pass only.

## Final check

Read the result aloud in your head. Confirm that it is specific, natural, and faithful. Verify every citation token before returning the result. Never claim that this process makes writing undetectable or guarantees human authorship.

The optional deterministic scanners in `scripts/` can flag mechanical tells in saved drafts. They are advisory and do not replace factual validation.

## Attribution

This adaptation draws on `humanizer-stack` at commit `13f5c023189d428ffba726c75886ca1fd0dcba65`, the upstream `blader/humanizer` skill, and the StoryScope study. See `references/ATTRIBUTION.md` and `references/LICENSE`.
