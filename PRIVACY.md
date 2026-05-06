# Summary Toolbox — Privacy Policy

_Last updated: 2026-05-06_

Summary Toolbox is a Chrome extension that extracts YouTube transcripts and, optionally, summarises the active web page through an AI provider you supply your own API key for. This document explains exactly what data the extension touches and where it goes.

## What stays on your device

- **Transcripts and page text.** Read directly from the active tab via `chrome.scripting`. Never written to any server we control.
- **Preferences and credentials.** UI toggles, the configured AI provider, model name, API key, Obsidian vault settings, and Notion integration token are stored in `chrome.storage.local`. Local-device only — not synced across browsers, not transmitted anywhere by Summary Toolbox.
- **Per-URL summary cache.** The most recent 20 summaries are kept locally so you can reopen the popup on a previously-summarised page and see the result without re-running the AI call. Eviction is by recency.

No analytics, no telemetry, no third-party SDKs, no remote code.

## What leaves your device, and only when

Summary Toolbox only makes network requests on **explicit user action**, with two narrow exceptions documented at the end of this section.

| Action | Endpoint | Sent | Trigger |
|---|---|---|---|
| Summarise (DeepSeek) | `api.deepseek.com` | Transcript or page text + your prompt | You click Summarise |
| Summarise (OpenAI) | `api.openai.com` | Transcript or page text + your prompt | You click Summarise |
| Summarise (Anthropic) | `api.anthropic.com` | Transcript or page text + your prompt | You click Summarise |
| Summarise (OpenRouter) | `openrouter.ai` | Transcript or page text + your prompt | You click Summarise |
| Summarise (Groq) | `api.groq.com` | Transcript or page text + your prompt | You click Summarise |
| Summarise (Gemini) | `generativelanguage.googleapis.com` | Transcript or page text + your prompt | You click Summarise |
| Save to Notion | `api.notion.com` | The summary text + the source URL | You click Save to Notion |
| Save to Obsidian | _Local `obsidian://` URL scheme_ | Summary text | You click Save to Obsidian — never hits the network |

Only one provider host is contacted per Summarise click — whichever you configured.

### YouTube caption fetch

When the popup opens on a YouTube watch page, the extension fetches the caption track URL from `youtube.com` (same-origin to the active tab). This is required to extract the transcript and is the same request the YouTube player itself makes.

### DeepSeek balance pill

If — and only if — your configured provider is DeepSeek and you have set an API key, the popup makes one `GET https://api.deepseek.com/user/balance` call when it opens, so it can show your remaining credit. The result is cached locally for 60 seconds. Other providers don't expose a comparable endpoint and trigger no automatic call.

## What we never do

- Summary Toolbox does not collect, log, or transmit any personally identifiable information.
- Summary Toolbox does not sell or share data with third parties.
- Summary Toolbox does not run any background scripts or service workers.
- Summary Toolbox does not include or load any remote code.
- Summary Toolbox does not use or transmit data for advertising or creditworthiness purposes.

## Default privacy posture

If you don't configure any AI provider and don't enter any keys, Summary Toolbox makes **zero** outbound network requests beyond reading the active tab's own data. Transcript extraction, search, copy, and TXT/SRT download all run entirely on your device.

## Permissions justification

| Permission | Why it's needed |
|---|---|
| `activeTab` | Read the active tab (YouTube transcript or page text) when you click the toolbar icon. |
| `scripting` | Inject the transcript scraper, the video-seek function, and (in page mode) the one-shot page-text reader into the active tab. |
| `storage` | Persist UI toggle preferences and your API credentials locally. |
| Host permissions for the six AI providers + `api.notion.com` | Send the transcript / page text / summary to whichever provider or save target you have configured, only when you click the relevant button. |

## Contact

Bug reports or privacy questions: <stefanbc9@gmail.com>
