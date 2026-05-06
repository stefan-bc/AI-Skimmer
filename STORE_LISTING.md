# Skimmer — Chrome Web Store listing draft

Paste these into the Chrome Web Store developer dashboard fields. None of this ships with the extension; it's just copy.

---

## Item name (max 75 characters)

`Skimmer — transcripts & page summaries`

(38 characters)

---

## Summary / short description (max 132 characters)

`YouTube transcripts with clickable timestamps. AI summaries of any web page. Bring your own key. Save to Obsidian or Notion.`

(124 characters — matches manifest.json "description" intent.)

---

## Detailed description

```
Skimmer is a small, fast Chrome extension with two jobs:

1. On a YouTube watch page, it pulls the full transcript into a searchable preview with clickable timestamps. Copy it to clipboard, or download as TXT or SRT.

2. On any other web page, it sends the page's main text to an AI provider you choose and returns a 5–7 bullet summary. Save the result to Obsidian or Notion in one click.

Features

• YouTube transcripts — full preview with clickable [mm:ss] chips that seek the player. Search-as-you-type filter, with matches highlighted inline.
• Toggleable timestamps and "[Music]" stripping — what you see is what gets copied.
• Download as TXT (with optional timestamps) or SRT (subtitle format).
• AI summaries — bring your own API key for DeepSeek, OpenAI, Anthropic Claude, OpenRouter, Groq, or Google Gemini. Streams the summary as it generates.
• Persistent "Extra focus" prompt — weight every summary toward your priorities (e.g. "key takeaways for beginners").
• Save summaries to Obsidian (via Advanced URI plugin) or Notion (via the official API + your integration token).
• Per-URL summary cache — reopen the popup on a previously-summarised page and the result is restored, with a "Previous summary from Xm ago" caption.
• Dark mode follows the OS preference.
• Keyboard shortcut: ⌘⇧O / Ctrl+Shift+O. Rebind at chrome://extensions/shortcuts.

Privacy

If you don't configure any AI provider, Skimmer makes ZERO outbound network requests. Transcripts are read directly from the active tab and stay on your device. All preferences and credentials are stored in chrome.storage.local — never synced.

When you do configure a provider, transcript or page text only leaves your device on an explicit click — never automatically. The extension only contacts the host of whichever provider you've configured. No analytics. No telemetry. No third-party SDKs. No remote code.

Full privacy policy: <PASTE PRIVACY URL>

Why "BYOK"?

Bring-your-own-key keeps the extension free, keeps your prompts off any service we run, and lets you pick the provider that suits your wallet and your priorities. DeepSeek and Groq are extremely cheap; OpenAI and Anthropic give the highest-quality summaries; Gemini has a generous free tier.

Limits

• Requires the YouTube video to have captions (manual or auto-generated).
• Doesn't support YouTube Shorts, live streams, or YouTube Music.
• Saving to Obsidian requires the Advanced URI community plugin.
• Saving to Notion requires creating a free Notion integration token.
```

---

## Category

**Productivity**

---

## Single purpose statement

```
Extract YouTube transcripts, or summarise the active web page, with the user's own AI key.
```

---

## Permissions justifications

| Permission | Justification |
|---|---|
| `activeTab` | Read the active tab (YouTube transcript or page text) when the user clicks the toolbar icon or presses the keyboard shortcut. |
| `scripting` | Inject the transcript scraper, the video-seek function, and (in page mode) the one-shot page-text reader into the active tab. No background script. |
| `storage` | Persist UI toggle preferences, the configured AI provider, and the user-supplied API credentials locally. Nothing syncs. |
| Host permission `https://api.deepseek.com/*` | Sends transcript / page text to DeepSeek for summarisation when the user has configured DeepSeek and clicks Summarise. Also fetches the user's remaining DeepSeek credit on popup open (cached 60 s). |
| Host permission `https://api.openai.com/*` | Sends transcript / page text to OpenAI for summarisation when the user has configured OpenAI and clicks Summarise. |
| Host permission `https://api.anthropic.com/*` | Sends transcript / page text to Anthropic for summarisation when the user has configured Anthropic and clicks Summarise. |
| Host permission `https://openrouter.ai/*` | Sends transcript / page text to OpenRouter for summarisation when the user has configured OpenRouter and clicks Summarise. |
| Host permission `https://api.groq.com/*` | Sends transcript / page text to Groq for summarisation when the user has configured Groq and clicks Summarise. |
| Host permission `https://generativelanguage.googleapis.com/*` | Sends transcript / page text to Google Gemini for summarisation when the user has configured Gemini and clicks Summarise. |
| Host permission `https://api.notion.com/*` | Saves the generated summary to a Notion page only when the user has configured a token and clicks "Save to Notion". |

---

## Data usage disclosures (Chrome Web Store form)

Tick **Yes** for the following data types and select **"Used for the user's primary purpose only"** (not "shared with third parties for advertising etc.") for each:

- **Authentication information** — API keys, Notion integration token. Stored locally; transmitted only to the corresponding configured provider on user action.
- **Personally identifiable information** — none collected by the extension itself, but transcripts and page text may incidentally include user-relevant content. This text is sent only to the LLM provider the user configured, only on explicit click.
- **Website content** — the extension reads the active tab's text and (in YouTube mode) the caption track URL.

Confirm **"I do not sell or transfer user data to third parties, outside of the approved use cases."** ✅
Confirm **"I do not use or transfer user data for purposes that are unrelated to my item's single purpose."** ✅
Confirm **"I do not use or transfer user data to determine creditworthiness or for lending purposes."** ✅

---

## Homepage URL

`<PASTE GITHUB REPO URL — e.g. https://github.com/stefan-bc/skimmer>`

---

## Privacy policy URL

`<PASTE GITHUB PAGES URL TO PRIVACY.md — e.g. https://stefan-bc.github.io/skimmer/PRIVACY.html>`

(Hosting tip: enable GitHub Pages on the repo, set source to `main` / root. The raw `PRIVACY.md` URL also works as a stopgap, but a rendered HTML page reads more professional to the reviewer.)

---

## Screenshots (1280×800, PNG)

You need 3–5. Suggested set, in order:

1. **YouTube preview pane** — popup open on a video showing 6–8 transcript segments, clickable timestamp chips visible.
2. **Search filter active** — same video, search box has a query, matches highlighted in `<mark>`.
3. **Summary bullets** — AI-generated bullet list with a clickable `[m:ss]` chip in one of the bullets.
4. **Page-mode summary** — popup open on a news article (not YouTube) showing the bullets only.
5. **Settings panel** — sections expanded so the BYOK provider list, Obsidian, and Notion fields are visible.

Tip: capture at exactly 1280×800 and save as PNG. Chrome's "Capture screenshot" devtools command (Cmd+Shift+P → "Capture full size screenshot") gives clean exports.

---

## Promotional images (optional but recommended)

- **Small promo tile** — 440×280
- **Marquee promo tile** — 1400×560 (only used if you're featured)

Skip on first submission. Add later if you want a chance at the carousel.

---

## Pre-submit checklist

- [ ] $5 dev fee paid on Chrome Web Store (one-time, lifetime).
- [ ] Public repo pushed to GitHub (and GitLab via your dual-remote setup).
- [ ] GitHub Pages enabled, `PRIVACY.md` reachable at a public URL.
- [ ] Web Store search for existing "Skimmer" extensions — fall back to "Skimmer Reader" or "Skimmer for YouTube" if a major collision exists.
- [ ] Test the unpacked extension end-to-end on a YouTube page and on a generic article.
- [ ] Test the BMAC link in the footer opens correctly.
- [ ] All 5 screenshots captured at 1280×800.
- [ ] `manifest.json` version is `1.0.0`.

---

## After submit

- Review takes 1–7 days typically. Sometimes 2–3 weeks for first publishes.
- If rejected, the email cites a specific policy. Most common rejections for BYOK extensions: insufficient permission justification (fix above) or missing privacy policy URL.
- Once live, the listing URL is `https://chromewebstore.google.com/detail/<id>` — pin that into your README.
