# System architecture

[Documentation](../README.md) / Architecture

## The responsibilities

| Component | Job | Persistent state |
| --- | --- | --- |
| VPS and Docker | Keep application services running independently of the user's laptop. | Host files, Docker volumes and deployment state. |
| Cloudflare tunnel and login gateways | Route public hostnames to the appropriate authenticated application. | Routing and access configuration. |
| Crypto Intelligence | Present research, queue imports, validate evidence and save outputs. | SQLite application database. |
| Hermes | Run Satoshi conversations, tools, project skills and dedicated editing sessions. | Hermes home, sessions, configuration and skills. |
| OpenViking | Retain source resources, extract memories and retrieve relevant context. | Encrypted native data and its matching recovery key. |
| Controlled release helper | Check, version, publish and restore dashboard code. | Git history, release ledger and release backups. |

![Brain, memory and database responsibilities](../handbook/assets/brain-map.png)

## From a source to usable evidence

Website imports are queued durably. Native OpenViking acquisition retains research, and registration creates the corresponding dashboard record. Satoshi's Telegram workflow retains the source and submits safe metadata plus its resource URI through the private registration queue. Evidence processing then extracts supported claims and dates into SQLite.

Memory retention, dashboard registration and evidence processing are distinct stages. A successful step does not prove every downstream stage completed. Original sources and supporting passages remain important when judging generated claims.

## From a question to a draft

Dashboard Prep and creator workflows select relevant records and ask the native Hermes agent to generate structured output. The application validates citations before treating the result as a valid saved output. Ordinary Satoshi conversations use the configured Hermes context and native memory provider.

The editing worker is different: GPT-6 Astra High, terminal/file tools, no automatic memory or context-file loading, no fallback model, and bounded iterations/time. Publication goes through a separate host helper. Its scope instructions are not an independent OS sandbox.

## Addresses and access

| Address | Purpose |
| --- | --- |
| [crypto.forkedbrain.fyi](https://crypto.forkedbrain.fyi/) | Research dashboard. |
| [brain.forkedbrain.fyi](https://brain.forkedbrain.fyi/) | Native Hermes assistant interface. |
| [Satoshi in Telegram](https://t.me/ForkedBrainSatoshi_Bot) | Assistant for allowlisted senders. |
| [manage.forkedbrain.fyi](https://manage.forkedbrain.fyi/) | Coolify administration for the maintainer. |

OpenViking remains on the private Docker network. The full VPS inventory, exact routes, models and storage paths are in the [Technical Handover Guide](../handbook/technical-handover.md).

## Custom work and integrated software

Custom work comprises the dashboard, project integrations and skills, and controlled release/recovery workflows. Hermes, OpenViking, React, Fastify, Docker, Coolify, Caddy and other dependencies are third-party software. Their native capabilities and licences belong to their respective projects.

This repository is not a backup of conversations, retained research, provider credentials or the complete VPS. [Recovery and handover requirements](../handover/README.md).
