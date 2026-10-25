---
name: Invoice privacy and paid-service scope
description: Durable privacy and cost boundary for the DocuMind invoice-processing product.
---

**Rule:** Keep invoice extraction, validation, and export local. Do not send invoice contents to external services or add paid APIs, services, or subscriptions.

**Why:** The user repeatedly directed that invoice information remain private and that no paid APIs or services be introduced.

**How to apply:** Prefer in-browser processing and export. Before considering any remote processing or paid dependency, stop and ask the user.
