# Skimmer

Chrome extension for grabbing YouTube video transcripts — searchable preview, clickable timestamps, copy to clipboard, download as TXT / SRT. Open the popup on any other web page and it switches to a one-click **Summarise** action that runs the page's main text through your own AI key.

## Features

- **Preview pane** — segmented view of every caption line.
- **Clickable timestamps** — tap any `[mm:ss]` chip to jump the video to that point.
- **Search** — filter segments as you type; matches are highlighted inline.
- **Include timestamps** toggle — prefix copied/downloaded text with `[mm:ss]`.
- **Strip non-speech markers** toggle — removes `[Music]`, `[Applause]`, etc.
- **Copy** to clipboard, or **download** as TXT or SRT.
- **AI summary (BYOK)** — generate a 5–7 bullet summary of a YouTube transcript *or* the active web page, via DeepSeek, OpenAI, Anthropic Claude, OpenRouter, Groq, or Google Gemini. Then **Copy**, **Save to Obsidian**, or **Save to Notion**.
- **Dark mode** — follows the OS preference automatically.
- Preferences and API credentials persist between opens (locally, never synced).

## Install

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Pin the extension from the puzzle-piece menu for quick access.

## Usage

### YouTube transcript

1. Open any `youtube.com/watch?v=...` page.
2. Open the popup — click the toolbar icon or press **⌘⇧O** (macOS) / **Ctrl+Shift+O** (other OS).
3. The transcript appears in the preview. From there:
   - Click any timestamp to jump to that moment in the video.
   - Type in the search box to filter segments.
   - Tick / untick toggles to shape the output.
   - **Copy transcript**, or click **TXT** / **SRT** to save.

### Summarise any web page

1. Open the popup on any regular web page (anything that isn't a YouTube watch page).
2. The transcript UI hides itself and a single **Summarise** button appears.
3. Click it. The extension reads the page's main content (`<article>` / `<main>` / `<body>`, in that order) and sends it to your configured AI provider.
4. Use **Copy**, **Save to Obsidian**, or **Save to Notion** on the result — same as the YouTube flow.

Restricted pages (`chrome://`, the Web Store, internal browser views) can't be read by extensions and will say so up front.

Reassign the shortcut at `chrome://extensions/shortcuts` if it clashes with something.

## Output formats

- **TXT** — plain text with an optional timestamp prefix per line and a metadata footer (title, channel, publish date, duration, URL).
- **SRT** — standard subtitle file, one cue per segment, ending where the next cue begins.

## Summary + save (optional)

The **Summarise** button is opt-in and requires a BYOK (bring-your-own-key) for one of six LLM providers. Output is 5–7 bullet points covering the main topics. The "Extra focus" input lets you persist priorities the model should weight on every run (e.g. *"key takeaways for beginners"*); pressing Enter triggers Summarise.

### Setup

Open the **Settings** panel at the bottom of the popup and fill in only what you need:

#### AI provider
- **Provider** — pick one of: DeepSeek, OpenAI, Anthropic Claude, OpenRouter, Groq, Google Gemini.
- **Model** — leave empty to use the provider default (shown as placeholder), or override with a specific model name.
- **API key** — get one from your chosen provider's dashboard. The same field stores keys per session; switching providers needs you to re-enter the key for the new one.

#### Save to Obsidian
- **Vault name** + **File path** — appends summaries to one Markdown file in your vault. Requires the [Advanced URI](https://github.com/Vinzent03/obsidian-advanced-uri) community plugin.

#### Save to Notion
1. Create an integration at [notion.so/my-integrations](https://www.notion.so/my-integrations) → copy the secret token.
2. Open the target Notion page → **⋯** menu → **Connections** → add your integration.
3. Copy the 32-character page ID from the page URL.
4. Paste both into Settings.

All values are stored in `chrome.storage.local` and never synced.

## Privacy

Transcripts and page text are read directly from the active tab via `chrome.scripting` and stay in your browser. Preferences and credentials are in `chrome.storage.local` (local device only, not synced). No analytics, no telemetry, no third-party SDKs.

Network requests only fire on explicit user action, and only to the host of your **configured provider**:

- **Summarise** → `POST` to one of `api.deepseek.com`, `api.openai.com`, `api.anthropic.com`, `openrouter.ai`, `api.groq.com`, or `generativelanguage.googleapis.com` (whichever you picked) with the transcript or page text.
- **Save to Notion** → `PATCH https://api.notion.com/v1/blocks/<page>/children` with the summary content.
- **Save to Obsidian** → uses the local `obsidian://` URL scheme; never hits the network.

If you don't configure any AI features, the extension makes zero network requests.

## Limits

- Requires videos to have captions (manual or auto-generated).
- Does not support Shorts, live streams, or YouTube Music.
- Extraction reads captions from YouTube's player response directly — no panel toggling, no DOM scraping, no scroll movement (even in theatre mode).
- YouTube occasionally renames DOM classes; if extraction breaks, inspect the transcript panel and update the selectors in `popup.js`.
- The "Show transcript" button is matched by English aria-label/text. Localised YouTube UIs (non-English) may report "no captions" even when captions are present — international support is a known gap.

## Update

Edit files, then return to `chrome://extensions` and click the refresh icon on this extension's card.
