// Summary Tool — popup controller.
// Extracts transcript on open, renders a segmented preview with clickable
// timestamps, and exposes copy, TXT/SRT download, search filter, and a
// "strip non-speech" toggle.

// DOM refs.
const statusEl = document.getElementById('status');
const previewEl = document.getElementById('preview');
const transcriptPaneEl = document.getElementById('transcript-pane');
const segCountEl = document.getElementById('seg-count');
const controlsEl = document.getElementById('controls');
const stampsEl = document.getElementById('stamps');
const stripNoiseEl = document.getElementById('stripNoise');
const searchEl = document.getElementById('search');
const copyBtn = document.getElementById('copy');
const dlTxt = document.getElementById('dl-txt');
const dlSrt = document.getElementById('dl-srt');
const videoTitleEl = document.getElementById('videoTitle');
const debugRow = document.getElementById('debug-row');
const copyDebugBtn = document.getElementById('copy-debug');
const summarizeBtn = document.getElementById('summarize');
const extraPromptEl = document.getElementById('extra-prompt');
const summarySection = document.getElementById('summary-section');
const summaryContent = document.getElementById('summary-content');
const copySummaryBtn = document.getElementById('copy-summary');
const saveObsidianBtn = document.getElementById('save-obsidian');
const saveNotionBtn = document.getElementById('save-notion');
const settingsEl = document.getElementById('settings');

// Data + page context, populated in init().
// `mode` flips between 'youtube' (transcript flow) and 'page' (summarise the
// active web page directly — no transcript). 'youtube' is the default so the
// transcript-specific UI behaves as before until init() decides otherwise.
let mode = 'youtube';
let segments = [];
let info = {};
let pageUrl = '';
let videoId = '';
let activeTabId = null;
// Diagnostic JSON staged by handleScrapeError; copied only if the user clicks.
let pendingDebug = '';
// Last DeepSeek summary text — held in memory so Copy / Save buttons reuse it
// without re-calling the API.
let lastSummary = '';

// LLM provider catalogue. Three API families share three adapter functions
// in callLLM; each provider just maps to a baseUrl + default model.
const PROVIDERS = {
  deepseek:   { label: 'DeepSeek',         baseUrl: 'https://api.deepseek.com',                          defaultModel: 'deepseek-chat',                family: 'openai' },
  openai:     { label: 'OpenAI',           baseUrl: 'https://api.openai.com/v1',                         defaultModel: 'gpt-4o-mini',                  family: 'openai' },
  anthropic:  { label: 'Anthropic Claude', baseUrl: 'https://api.anthropic.com',                         defaultModel: 'claude-haiku-4-5-20251001',    family: 'anthropic' },
  openrouter: { label: 'OpenRouter',       baseUrl: 'https://openrouter.ai/api/v1',                      defaultModel: 'anthropic/claude-3.5-haiku',   family: 'openai' },
  groq:       { label: 'Groq',             baseUrl: 'https://api.groq.com/openai/v1',                    defaultModel: 'llama-3.3-70b-versatile',      family: 'openai' },
  gemini:     { label: 'Google Gemini',    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',  defaultModel: 'gemini-2.0-flash',             family: 'gemini' },
};
const DEFAULT_PROVIDER = 'deepseek';

// Settings field IDs ↔ storage keys. Bound on load so each change persists.
const SETTING_FIELDS = [
  ['set-provider',     'llmProvider'],
  ['set-llm-model',    'llmModel'],
  ['set-llm-key',      'llmKey'],
  ['set-obs-vault',    'obsVault'],
  ['set-obs-path',     'obsPath'],
  ['set-notion-token', 'notionToken'],
  ['set-notion-page',  'notionPage'],
];

// Populate the settings panel from chrome.storage and persist on input change.
async function initSettings() {
  const keys = SETTING_FIELDS.map(([, k]) => k).concat(['extraPrompt', 'deepseekKey']);
  const values = await chrome.storage.local.get(keys);

  // One-time migration: prior versions stored the key as `deepseekKey`.
  // Move it to the generic `llmKey` slot so existing users don't lose access.
  if (!values.llmKey && values.deepseekKey) {
    values.llmKey = values.deepseekKey;
    values.llmProvider = values.llmProvider || 'deepseek';
    await chrome.storage.local.set({ llmKey: values.llmKey, llmProvider: values.llmProvider });
    await chrome.storage.local.remove('deepseekKey');
  }

  for (const [id, key] of SETTING_FIELDS) {
    const el = document.getElementById(id);
    el.value = values[key] || (key === 'llmProvider' ? DEFAULT_PROVIDER : '');
    el.addEventListener('change', () => {
      chrome.storage.local.set({ [key]: el.value.trim() });
    });
  }

  // Provider dropdown drives the Model placeholder so users see what default
  // they'd get if they leave the override blank.
  const providerEl = document.getElementById('set-provider');
  const modelEl = document.getElementById('set-llm-model');
  const refreshModelPlaceholder = () => {
    const def = PROVIDERS[providerEl.value] || PROVIDERS[DEFAULT_PROVIDER];
    modelEl.placeholder = def.defaultModel;
  };
  providerEl.addEventListener('change', refreshModelPlaceholder);
  refreshModelPlaceholder();

  // Extra-prompt line: persist on every change (input + change events) so
  // edits survive popup close even without an explicit blur.
  extraPromptEl.value = values.extraPrompt || '';
  const persistExtra = () => chrome.storage.local.set({ extraPrompt: extraPromptEl.value });
  extraPromptEl.addEventListener('input', persistExtra);
  extraPromptEl.addEventListener('change', persistExtra);
  // Enter triggers Summarise — modifier-free only, so browser shortcuts
  // (e.g. ⌘⏎) keep working as expected.
  extraPromptEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (!summarizeBtn.disabled) summarizeBtn.click();
    }
  });
}
initSettings();

// Footer shortcut defaults to mac glyphs in HTML; rewrite for other platforms
// so Windows/Linux users see a correct hint.
const platform = navigator.userAgentData?.platform || navigator.platform || '';
if (!/mac/i.test(platform)) {
  const keys = document.querySelector('.keys');
  if (keys) keys.innerHTML = '<kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>O</kbd>';
}

// ⌘⇧O while the popup is focused closes it, mirroring Chrome's toggle
// behaviour on `_execute_action`.
window.addEventListener('keydown', (e) => {
  if (e.key.toLowerCase() === 'o' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
    e.preventDefault();
    window.close();
  }
});

init();

async function init() {
  try {
    // Restore toggle preferences before extraction so the first render matches
    // what the user last chose.
    const prefs = await chrome.storage.local.get(['stamps', 'stripNoise']);
    if (prefs.stamps === false) stampsEl.checked = false;
    if (prefs.stripNoise === true) stripNoiseEl.checked = true;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Strict check: only main-site watch pages get the transcript flow.
    // Anything else (Shorts, music, plain web pages) falls into page mode
    // where the user can still summarise the active tab.
    let parsedUrl;
    try { parsedUrl = new URL(tab?.url || ''); } catch {}
    const isWatch = parsedUrl?.hostname === 'www.youtube.com' && parsedUrl.pathname === '/watch';
    if (!isWatch) {
      initPageMode(tab, parsedUrl);
      return;
    }

    activeTabId = tab.id;
    pageUrl = tab.url;
    videoId = parsedUrl.searchParams.get('v') || '';

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      // MAIN world so the scroll-method monkey-patches inside scrapePage
      // actually intercept YouTube's own click handlers (which run there).
      world: 'MAIN',
      func: scrapePage,
    });

    if (!result?.segments?.length) {
      handleScrapeError(result);
      return;
    }

    segments = result.segments;
    info = result.info || {};

    if (info.title) {
      videoTitleEl.textContent = info.title;
      videoTitleEl.hidden = false;
    }

    renderPreview();
    segCountEl.textContent = `${segments.length} segments`;
    transcriptPaneEl.hidden = false;
    controlsEl.hidden = false;
    setStatus('Ready.', 'ok');
  } catch (e) {
    setStatus(`Error: ${e.message}`, 'err');
  }
}

// Page mode — invoked when the active tab isn't a YouTube watch page.
// Repurposes the popup so the user can summarise the page they're on,
// reusing the existing LLM + Save flows. No transcript, no preview, no
// downloads — Summarise is the only action.
function initPageMode(tab, parsedUrl) {
  if (isRestrictedUrl(parsedUrl)) {
    setStatus("Chrome doesn't let extensions read this page. Open a regular web page or a YouTube video.", 'err');
    return;
  }

  mode = 'page';
  activeTabId = tab.id;
  pageUrl = tab.url || '';
  info = { title: (tab.title || '').trim() };

  if (info.title) {
    videoTitleEl.textContent = info.title;
    videoTitleEl.hidden = false;
  }

  // Reveal the action block but hide transcript-only controls. Summarise
  // becomes the sole primary action; the transcript pane stays collapsed.
  copyBtn.hidden = true;
  controlsEl.hidden = false;
  extraPromptEl.placeholder = 'Extra focus (e.g. just the conclusion, or beginner-friendly takeaways)…';

  setStatus('Ready to summarise this page.', 'ok');
}

// Schemes/hosts where chrome.scripting can't run. Used to fail fast in page
// mode with a friendly message rather than a cryptic injection error.
function isRestrictedUrl(parsed) {
  if (!parsed) return true;
  const restrictedSchemes = ['chrome:', 'chrome-extension:', 'edge:', 'about:', 'view-source:', 'devtools:'];
  if (restrictedSchemes.includes(parsed.protocol)) return true;
  if (parsed.hostname === 'chromewebstore.google.com') return true;
  if (parsed.hostname === 'chrome.google.com' && parsed.pathname.startsWith('/webstore')) return true;
  return false;
}

function setStatus(text, cls = '') {
  statusEl.textContent = text;
  statusEl.className = cls;
}

// Translate scrape error codes into friendlier messages. Unknown codes fall
// through to the raw string so we don't silently swallow anything.
function handleScrapeError(result) {
  const code = result?.error || 'unknown';
  const messages = {
    'no-button': "This video doesn't have captions available.",
    'panel-empty': 'Captions failed to load — YouTube returned an empty or invalid response. Try refreshing the YouTube tab and reopening the popup.',
  };
  let msg = messages[code] || result?.error || 'No transcript available.';

  // When diagnostics are attached, stage them and reveal the copy button —
  // never write to the clipboard without an explicit user click.
  if (result?.debug) {
    msg += ' Use the button below to copy a diagnostic and paste it to me.';
    pendingDebug = JSON.stringify(result.debug, null, 2);
    debugRow.hidden = false;
  }
  setStatus(msg, 'err');
}

// Diagnostic-copy button — only active after a panel-empty failure.
copyDebugBtn.addEventListener('click', async () => {
  if (!pendingDebug) return;
  try {
    await navigator.clipboard.writeText(pendingDebug);
    copyDebugBtn.textContent = 'Copied!';
    setTimeout(() => { copyDebugBtn.textContent = 'Copy diagnostic'; }, 1500);
  } catch (e) {
    setStatus(`Copy failed: ${e.message}`, 'err');
  }
});

// Regex for caption noise: bracketed markers like [Music] / [Applause], and
// caption leader arrows ">>" that YouTube uses for speaker changes.
const NOISE_RE = /\[[^\]]+\]|^\s*>>\s*/g;

// Returns the current segment list with non-speech markers removed when the
// toggle is on. Shared by preview, clipboard copy, and both downloads so the
// output stays consistent.
function effectiveSegments() {
  if (!stripNoiseEl.checked) return segments;
  return segments
    .map(s => ({
      timestamp: s.timestamp,
      text: s.text.replace(NOISE_RE, '').replace(/\s+/g, ' ').trim(),
    }))
    .filter(s => s.text);
}

// Convert "m:ss" or "h:mm:ss" into seconds — used when seeking the player.
function parseStamp(ts) {
  const parts = (ts || '').split(':').map(n => parseInt(n, 10) || 0);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// Minimal HTML escape, applied to every user-visible string before insertion
// via innerHTML (only used for search highlighting).
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Wrap every case-insensitive match of `query` in <mark>; otherwise
// return the plain escaped text.
function highlight(text, query) {
  if (!query) return escapeHtml(text);
  const lower = text.toLowerCase();
  let out = '';
  let i = 0;
  while (i < text.length) {
    const m = lower.indexOf(query, i);
    if (m === -1) { out += escapeHtml(text.slice(i)); break; }
    out += escapeHtml(text.slice(i, m))
      + '<mark>' + escapeHtml(text.slice(m, m + query.length)) + '</mark>';
    i = m + query.length;
  }
  return out;
}

// Render the segmented preview. Invoked after extraction, on every toggle
// change, and on search input (debounced).
function renderPreview() {
  const query = (searchEl.value || '').trim().toLowerCase();
  const rows = effectiveSegments();

  previewEl.classList.toggle('no-stamps', !stampsEl.checked);

  const frag = document.createDocumentFragment();
  for (const s of rows) {
    if (query && !s.text.toLowerCase().includes(query)) continue;

    const row = document.createElement('div');
    row.className = 'seg';

    if (s.timestamp) {
      const t = document.createElement('button');
      t.className = 't';
      t.type = 'button';
      t.textContent = s.timestamp;
      t.dataset.sec = String(parseStamp(s.timestamp));
      t.title = 'Jump to this point in the video';
      row.appendChild(t);
    }

    const span = document.createElement('span');
    span.className = 'txt';
    span.innerHTML = highlight(s.text, query);
    row.appendChild(span);

    frag.appendChild(row);
  }

  previewEl.replaceChildren(frag);

  // Helpful empty state when the search filter matches nothing.
  if (query && !previewEl.children.length) {
    const empty = document.createElement('div');
    empty.className = 'seg';
    empty.style.color = 'var(--base-muted)';
    empty.textContent = 'No matches.';
    previewEl.appendChild(empty);
  }
}

// Delegate timestamp-chip clicks to a single listener on the preview container.
previewEl.addEventListener('click', (e) => {
  const t = e.target.closest('.t');
  if (!t) return;
  const sec = Number(t.dataset.sec);
  if (Number.isFinite(sec)) seekVideo(sec);
});

// Inject a tiny function into the page that moves the video's current time
// and focuses the tab so the user can see the jump. Runs in MAIN world so we
// can call YouTube's own player API — writes to <video>.currentTime from the
// isolated world get snapped back by the player's internal state sync.
async function seekVideo(seconds) {
  if (activeTabId == null) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: activeTabId },
      world: 'MAIN',
      func: (t) => {
        const player = document.getElementById('movie_player');
        if (player && typeof player.seekTo === 'function') {
          player.seekTo(t, true);
          return;
        }
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (v) { v.currentTime = t; v.play().catch(() => {}); }
      },
      args: [seconds],
    });
    await chrome.tabs.update(activeTabId, { active: true });
  } catch (e) {
    setStatus(`Seek failed: ${e.message}`, 'err');
  }
}

// Plain-text builder for clipboard and TXT export. Uses effectiveSegments so
// both toggles (timestamps + strip-noise) are applied consistently.
function buildText(withStamps) {
  const body = effectiveSegments()
    .map(s => (withStamps && s.timestamp ? `[${s.timestamp}] ${s.text}` : s.text))
    .join('\n');
  return body + footerBlock();
}

// Metadata block appended to both preview output and TXT/SRT exports.
function footerBlock() {
  // en-CA formats as YYYY-MM-DD and respects the user's local timezone —
  // toISOString would give UTC and can read as "tomorrow" late in the day.
  const today = new Date().toLocaleDateString('en-CA');
  const lines = ['', '---'];
  if (info.title)     lines.push(`Title: ${info.title}`);
  if (info.channel)   lines.push(`Channel: ${info.channel}`);
  if (info.published) lines.push(`Published: ${info.published}`);
  if (info.duration)  lines.push(`Duration: ${info.duration}`);
  lines.push(`URL: ${pageUrl}`);
  lines.push(`Extracted: ${today}`);
  return lines.join('\n');
}

// Persist each toggle on change, then repaint the preview.
stampsEl.addEventListener('change', () => {
  chrome.storage.local.set({ stamps: stampsEl.checked });
  renderPreview();
});
stripNoiseEl.addEventListener('change', () => {
  chrome.storage.local.set({ stripNoise: stripNoiseEl.checked });
  renderPreview();
});

// Debounced search — avoids re-rendering the list on every keystroke for
// long transcripts.
let searchTimer = null;
searchEl.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(renderPreview, 120);
});

// Copy handler: clipboard write + brief visual confirmation on the button.
copyBtn.addEventListener('click', async () => {
  try {
    const text = buildText(stampsEl.checked);
    await navigator.clipboard.writeText(text);
    const label = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = label; }, 1500);
    setStatus(`Copied ${text.length.toLocaleString()} characters.`, 'ok');
  } catch (e) {
    setStatus(`Copy failed: ${e.message}`, 'err');
  }
});

dlTxt.addEventListener('click', () => saveAs('txt'));
dlSrt.addEventListener('click', () => saveAs('srt'));

function saveAs(kind) {
  let content;
  const mime = 'text/plain';
  if (kind === 'srt') {
    // SRT with the metadata appended as comment lines (`# ...`).
    const footer = footerBlock().split('\n').map(l => (l ? `# ${l}` : '')).join('\n');
    content = toSrt(effectiveSegments(), info.duration) + '\n' + footer;
  } else {
    content = buildText(stampsEl.checked);
  }
  const name = buildFilename(kind);
  downloadBlob(content, name, mime);
  setStatus(`Downloaded ${name}.`, 'ok');
}

// Filename format: "Title - Channel.ext", falling back to the video id.
function buildFilename(ext) {
  const parts = [];
  if (info.title)   parts.push(cleanName(info.title));
  if (info.channel) parts.push(cleanName(info.channel));
  if (!parts.length) parts.push(videoId || 'transcript');
  return `${parts.join(' - ')}.${ext}`;
}

// Strip characters that break on macOS / Windows filesystems, then clamp length.
function cleanName(s) {
  return s.replace(/[\/\\:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

// Save a string to disk via a transient Blob URL.
function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// SRT helpers. Work in whole seconds end-to-end — YouTube only gives
// second-granularity stamps, so the millisecond field is always ,000.
function srtFromSec(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},000`;
}
// Build SRT cues. Each cue ends where the next begins; the final cue runs
// for 3 s but gets clamped to the video's total duration when we scraped it.
function toSrt(items, durationStamp) {
  const durSec = durationStamp ? parseStamp(durationStamp) : 0;
  const cues = [];
  items.forEach((item, i) => {
    if (!item.timestamp) return;
    const startSec = parseStamp(item.timestamp);
    const nextStamp = items[i + 1]?.timestamp;
    let endSec;
    if (nextStamp) {
      endSec = parseStamp(nextStamp);
    } else {
      endSec = startSec + 3;
      if (durSec > startSec) endSec = Math.min(endSec, durSec);
    }
    cues.push(`${cues.length + 1}\n${srtFromSec(startSec)} --> ${srtFromSec(endSec)}\n${item.text}`);
  });
  return cues.join('\n\n');
}

// --------------------------------------------------------------------------
// Summary feature — DeepSeek BYOK + save to Obsidian / Notion.
// All keys live in chrome.storage.local; nothing leaves the device except
// the explicit POST to api.deepseek.com / PATCH to api.notion.com.
// --------------------------------------------------------------------------

// Cap transcript at ~80k chars (~20k tokens) — plenty of headroom under
// DeepSeek-chat's 64k context and keeps cost predictable.
const SUMMARY_INPUT_CAP = 80000;

const SUMMARY_SYSTEM_PROMPT =
  'You summarise YouTube video transcripts.\n\n' +
  'Output 5–7 concise bullet points covering the main topics, each prefixed with "- ".\n' +
  'No preamble, no closing remarks, no headings, no extra blank lines.';

// Page-mode counterpart. Same shape (5–7 bullets) so the renderer + save
// flows don't need to know which mode produced the summary.
const PAGE_SUMMARY_SYSTEM_PROMPT =
  'You summarise web pages.\n\n' +
  'Output 5–7 concise bullet points covering the main points of the page, each prefixed with "- ".\n' +
  'Ignore navigation, cookie banners, ads, and footer boilerplate.\n' +
  'No preamble, no closing remarks, no headings, no extra blank lines.';

summarizeBtn.addEventListener('click', summarise);
copySummaryBtn.addEventListener('click', copySummary);
saveObsidianBtn.addEventListener('click', saveToObsidian);
saveNotionBtn.addEventListener('click', saveToNotion);

async function summarise() {
  const stored = await chrome.storage.local.get(['llmProvider', 'llmModel', 'llmKey', 'extraPrompt']);
  const providerKey = stored.llmProvider || DEFAULT_PROVIDER;
  const provider = PROVIDERS[providerKey] || PROVIDERS[DEFAULT_PROVIDER];
  const apiKey = (stored.llmKey || '').trim();

  if (!apiKey) {
    setStatus(`Add a ${provider.label} API key in Settings first.`, 'err');
    settingsEl.open = true;
    return;
  }

  const subject = mode === 'page' ? 'page' : 'transcript';
  const origLabel = summarizeBtn.textContent;
  summarizeBtn.disabled = true;
  summarizeBtn.textContent = 'Summarising…';

  try {
    // Resolve the input text + system prompt for the current mode.
    // YouTube mode uses the already-extracted transcript; page mode injects
    // a one-shot scraper into the active tab to read its main content.
    let inputText;
    let systemBase;
    if (mode === 'page') {
      setStatus('Reading page…');
      const page = await readPageText();
      if (!page || !page.text) throw new Error("This page has no readable text.");
      // If init() didn't capture a title (e.g. tab.title was empty), pick up
      // whatever the document reports now and surface it in the header.
      if (page.title && !info.title) {
        info.title = page.title;
        videoTitleEl.textContent = page.title;
        videoTitleEl.hidden = false;
      }
      inputText = page.text;
      systemBase = PAGE_SUMMARY_SYSTEM_PROMPT;
    } else {
      if (!segments.length) throw new Error('No transcript to summarise.');
      // Plain text, no timestamps — gives the model more transcript per token.
      inputText = segments.map(s => s.text).join(' ');
      systemBase = SUMMARY_SYSTEM_PROMPT;
    }

    const truncated = inputText.length > SUMMARY_INPUT_CAP;
    if (truncated) inputText = inputText.slice(0, SUMMARY_INPUT_CAP);

    // Live extra-prompt input wins so unblurred edits aren't lost.
    const extra = (extraPromptEl.value || stored.extraPrompt || '').trim();
    const systemContent = extra
      ? `${systemBase}\n\nThe user has additional priorities. Address them directly in one of the bullets:\n"${extra}"`
      : systemBase;

    setStatus(truncated
      ? `Sending (truncated) ${subject} to ${provider.label}…`
      : `Sending ${subject} to ${provider.label}…`);

    const summary = await callLLM({
      providerKey,
      model: (stored.llmModel || '').trim(),
      apiKey,
      system: systemContent,
      user: inputText,
    });
    lastSummary = summary;
    renderSummary(summary);
    summarySection.hidden = false;
    // Collapse the transcript pane so the summary takes the focus. User can
    // re-open it any time by clicking the Transcript row.
    transcriptPaneEl.open = false;
    setStatus(truncated ? 'Summary ready (input truncated).' : 'Summary ready.', 'ok');
  } catch (e) {
    setStatus(`Summary failed: ${e.message}`, 'err');
  } finally {
    summarizeBtn.disabled = false;
    summarizeBtn.textContent = origLabel;
  }
}

// Inject a tiny scraper into the active tab and pull back its main text.
// Prefers <article> / <main> / [role=main] before falling back to <body>;
// innerText respects CSS visibility, so hidden nav/cookie banners drop out.
async function readPageText() {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: activeTabId },
    func: () => {
      const root = document.querySelector('article')
        || document.querySelector('main')
        || document.querySelector('[role="main"]')
        || document.body;
      const text = (root?.innerText || '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      return { title: (document.title || '').trim(), text };
    },
  });
  return result;
}

// Provider-agnostic LLM call. Routes by the provider's API family; each branch
// is a self-contained adapter for that family's request/response shape.
async function callLLM({ providerKey, model, apiKey, system, user, temperature = 0.3, maxTokens = 600 }) {
  const provider = PROVIDERS[providerKey] || PROVIDERS[DEFAULT_PROVIDER];
  const useModel = model || provider.defaultModel;

  const fail = async (res) => {
    const t = await res.text().catch(() => '');
    throw new Error(`${provider.label} ${res.status}${t ? ': ' + t.slice(0, 200) : ''}`);
  };

  if (provider.family === 'openai') {
    // OpenAI-compatible chat completions — covers DeepSeek, OpenAI, OpenRouter, Groq.
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature,
        max_tokens: maxTokens,
      }),
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content?.trim() || '';
    if (!content) throw new Error('Empty response');
    return content;
  }

  if (provider.family === 'anthropic') {
    // Anthropic Messages API — separate `system` field, x-api-key auth, and
    // the dangerous-direct-browser-access opt-in for non-server callers.
    const res = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: useModel,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    const content = (data?.content || []).map(b => b?.text || '').join('').trim();
    if (!content) throw new Error('Empty response');
    return content;
  }

  if (provider.family === 'gemini') {
    // Gemini — key in query string, separate system_instruction field.
    const url = `${provider.baseUrl}/models/${encodeURIComponent(useModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) await fail(res);
    const data = await res.json();
    const content = (data?.candidates?.[0]?.content?.parts || [])
      .map(p => p?.text || '').join('').trim();
    if (!content) throw new Error('Empty response');
    return content;
  }

  throw new Error(`Unknown provider family: ${provider.family}`);
}

// Pull bullet lines out of the model response, stripping bullet markers /
// numbering so the renderer can apply its own list styling.
function parseSummaryResponse(text) {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => l.replace(/^[-*•]\s+|^\d+[.)]\s+/, '').trim())
    .filter(Boolean);
}

function renderSummary(text) {
  const bullets = parseSummaryResponse(text);
  summaryContent.replaceChildren();
  const ul = document.createElement('ul');
  for (const b of bullets) {
    const li = document.createElement('li');
    li.textContent = b;
    ul.appendChild(li);
  }
  summaryContent.appendChild(ul);
}

// Markdown payload for clipboard + Obsidian. Format: title, YouTube link, bullets.
function buildMarkdownPayload() {
  const title = info.title || 'Untitled video';
  const bullets = parseSummaryResponse(lastSummary);
  return [`## ${title}`, pageUrl, '', bullets.map(b => `- ${b}`).join('\n')].join('\n') + '\n';
}

async function copySummary() {
  if (!lastSummary) return;
  try {
    await navigator.clipboard.writeText(buildMarkdownPayload());
    const orig = copySummaryBtn.textContent;
    copySummaryBtn.textContent = 'Copied!';
    setTimeout(() => { copySummaryBtn.textContent = orig; }, 1500);
    setStatus('Summary copied.', 'ok');
  } catch (e) {
    setStatus(`Copy failed: ${e.message}`, 'err');
  }
}

async function saveToObsidian() {
  if (!lastSummary) return;
  const stored = await chrome.storage.local.get(['obsVault', 'obsPath']);
  // Accept loose user input: surrounding quotes, backslashes, or a full
  // absolute filesystem path. Advanced URI itself only takes a vault name +
  // vault-relative path, so we normalise here rather than nag the user.
  const stripQuotes = s => (s || '').trim().replace(/^['"]|['"]$/g, '').trim();
  const obsVault = stripQuotes(stored.obsVault);
  let obsPath = stripQuotes(stored.obsPath).replace(/\\/g, '/');

  // If the field holds an absolute path, slice off everything up to and
  // including the vault folder so what's left is vault-relative. Falls back
  // to the basename when the vault name isn't found in the path.
  if (obsPath.startsWith('/') && obsVault) {
    const marker = '/' + obsVault + '/';
    const idx = obsPath.lastIndexOf(marker);
    obsPath = idx !== -1
      ? obsPath.slice(idx + marker.length)
      : (obsPath.split('/').pop() || obsPath);
  }
  obsPath = obsPath.replace(/^\/+/, '');

  if (!obsVault || !obsPath) {
    setStatus('Set Obsidian vault and file path in Settings.', 'err');
    settingsEl.open = true;
    return;
  }

  // Put the markdown on the clipboard, then have Advanced URI pull from
  // there. Keeps the URI short (no embedded summary) — sidesteps URL-encoding
  // and length issues that can mangle a long inline `data=` payload.
  const data = '\n\n' + buildMarkdownPayload();
  try {
    await navigator.clipboard.writeText(data);
  } catch (e) {
    setStatus(`Clipboard write failed: ${e.message}`, 'err');
    return;
  }
  const uri = 'obsidian://adv-uri'
    + `?vault=${encodeURIComponent(obsVault)}`
    + `&filepath=${encodeURIComponent(obsPath)}`
    + `&clipboard=true`
    + `&mode=append`;
  triggerScheme(uri);
  setStatus(`Sent to Obsidian (vault="${obsVault}", file="${obsPath}").`, 'ok');
}

// Anchor click in the popup itself. This is a top-level navigation in the
// same user-activation tick — Chrome remembers an "Always allow" choice
// against the popup origin, so subsequent saves dispatch silently. Tabs
// opened via chrome.tabs.create count as fresh nav and re-prompt every time.
// Side effect: the popup unloads as Obsidian takes focus.
function triggerScheme(uri) {
  console.log('[Summary Tool] Dispatching URI:', uri);
  const a = document.createElement('a');
  a.href = uri;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function saveToNotion() {
  if (!lastSummary) return;
  const { notionToken, notionPage } = await chrome.storage.local.get(['notionToken', 'notionPage']);
  if (!notionToken || !notionPage) {
    setStatus('Set Notion token and page ID in Settings.', 'err');
    settingsEl.open = true;
    return;
  }

  saveNotionBtn.disabled = true;
  setStatus('Saving to Notion…');

  try {
    // Notion accepts ids with or without dashes; normalise to be safe.
    const pageId = notionPage.replace(/-/g, '').trim();
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${notionToken}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ children: buildNotionBlocks() }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Notion ${res.status}${t ? ': ' + t.slice(0, 200) : ''}`);
    }
    setStatus('Saved to Notion.', 'ok');
  } catch (e) {
    setStatus(`Notion save failed: ${e.message}`, 'err');
  } finally {
    saveNotionBtn.disabled = false;
  }
}

// Build Notion children blocks: heading with the title, paragraph with the
// linked URL, then one bulleted_list_item per summary bullet.
function buildNotionBlocks() {
  const title = info.title || 'Untitled video';
  const bullets = parseSummaryResponse(lastSummary);
  const blocks = [
    {
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: title.slice(0, 1900) } }],
      },
    },
    {
      object: 'block',
      type: 'paragraph',
      paragraph: {
        rich_text: [{ type: 'text', text: { content: pageUrl, link: { url: pageUrl } } }],
      },
    },
  ];

  for (const b of bullets) {
    blocks.push({
      object: 'block',
      type: 'bulleted_list_item',
      bulleted_list_item: {
        // 2000-char cap per Notion rich_text content; clamp defensively.
        rich_text: [{ type: 'text', text: { content: b.slice(0, 1900) } }],
      },
    });
  }
  return blocks;
}

// --------------------------------------------------------------------------
// Injected page scraper. Runs in MAIN world via chrome.scripting.executeScript.
// Toggles the transcript engagement panel's `visibility` attribute to
// EXPANDED (no DOM clicks, no description-expand) and reads the segment
// elements directly. Hides the panel again on the way out.
//
// Returns { segments: [{timestamp,text}], info: {...} } on success, or
// { error: code, debug? } on failure. Codes:
//   'no-button'   — no transcript panel exists in DOM (video has no captions).
//   'panel-empty' — panel exists but produced no segment elements after toggle.
// --------------------------------------------------------------------------
async function scrapePage() {
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // SPA wait — make sure the watch element matches the URL before we read DOM.
  const urlVid = new URL(location.href).searchParams.get('v');
  if (urlVid) {
    const started = Date.now();
    while (Date.now() - started < 3000) {
      const domVid = document.querySelector('ytd-watch-flexy')?.getAttribute('video-id');
      if (domVid === urlVid) break;
      await sleep(100);
    }
  }

  const PANEL_SEL = 'ytd-engagement-panel-section-list-renderer';
  const SEG_SEL = 'transcript-segment-view-model, ytd-transcript-segment-renderer';

  // Snapshot panel visibilities so we hide back any panel we caused to expand.
  const initialPanelState = new Map();
  for (const p of document.querySelectorAll(PANEL_SEL)) {
    initialPanelState.set(p, p.getAttribute('visibility') || 'unset');
  }

  // Best-effort scroll lock. Doesn't help for every theatre-mode quirk but
  // prevents anything that goes through the standard scroll APIs.
  const initialScrollX = window.scrollX;
  const initialScrollY = window.scrollY;
  const htmlEl = document.documentElement;
  const _origHtmlOverflow = htmlEl.style.overflow;
  htmlEl.style.overflow = 'hidden';

  const cleanup = () => {
    try {
      for (const p of document.querySelectorAll(PANEL_SEL)) {
        const orig = initialPanelState.get(p) || 'unset';
        const now = p.getAttribute('visibility') || 'unset';
        if (now === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' &&
            orig !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
          p.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
        }
      }
      if (window.scrollX !== initialScrollX || window.scrollY !== initialScrollY) {
        window.scrollTo(initialScrollX, initialScrollY);
      }
    } catch (e) {}
    htmlEl.style.overflow = _origHtmlOverflow;
  };

  const transcriptPanels = [...document.querySelectorAll(PANEL_SEL)]
    .filter(p => (p.getAttribute('target-id') || '').toLowerCase().includes('transcript'));

  if (!transcriptPanels.length) {
    cleanup();
    return { error: 'no-button' };
  }

  // Expand any transcript panel we found by setting its visibility attribute.
  // YouTube's polymer reactivity populates segment elements lazily.
  for (const p of transcriptPanels) {
    p.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  }

  // Wait for segments. Up to 8 s — modern videos populate within 1 s, but
  // ASR-only or large transcripts can take longer.
  const findSegmentNodes = () => {
    for (const p of transcriptPanels) {
      const nodes = p.querySelectorAll(SEG_SEL);
      if (nodes.length) return nodes;
    }
    return document.querySelectorAll(SEG_SEL);
  };
  let segNodes = findSegmentNodes();
  const start = Date.now();
  while (segNodes.length === 0 && Date.now() - start < 8000) {
    await sleep(100);
    segNodes = findSegmentNodes();
  }

  if (segNodes.length === 0) {
    cleanup();
    return {
      error: 'panel-empty',
      debug: {
        panelCount: transcriptPanels.length,
        modernSegs: document.querySelectorAll('transcript-segment-view-model').length,
        legacySegs: document.querySelectorAll('ytd-transcript-segment-renderer').length,
      },
    };
  }

  // Read each segment. Modern uses <transcript-segment-view-model>, legacy
  // uses <ytd-transcript-segment-renderer> — different inner selectors.
  const readSeg = (seg) => {
    if (seg.tagName === 'TRANSCRIPT-SEGMENT-VIEW-MODEL') {
      const stamp = seg.querySelector('.ytwTranscriptSegmentViewModelTimestamp')?.textContent?.trim() || '';
      const cap = seg.querySelector('span[role="text"]');
      return { timestamp: stamp, text: (cap?.textContent || '').trim() };
    }
    return {
      timestamp: seg.querySelector('.segment-timestamp')?.textContent?.trim() || '',
      text: seg.querySelector('.segment-text, yt-formatted-string.segment-text')?.textContent?.trim() || '',
    };
  };

  const raw = [...segNodes].map(readSeg).filter(s => s.text);
  // Dedupe adjacent exact repeats only.
  const segments = [];
  for (const cur of raw) {
    const prev = segments[segments.length - 1];
    if (prev && prev.text === cur.text) continue;
    segments.push(cur);
  }

  // Metadata. Prefer player response (most reliable), fall back to DOM.
  const player = document.getElementById('movie_player');
  let response;
  try { response = player?.getPlayerResponse?.(); } catch (e) {}
  response = response || window.ytInitialPlayerResponse;

  const v = response?.videoDetails || {};
  const m = response?.microformat?.playerMicroformatRenderer || {};
  const lengthSec = parseInt(v.lengthSeconds, 10);
  const pad = n => String(n).padStart(2, '0');
  const secsToStamp = secs => {
    const h = Math.floor(secs / 3600);
    const mn = Math.floor((secs % 3600) / 60);
    const sc = secs % 60;
    return h > 0 ? `${h}:${pad(mn)}:${pad(sc)}` : `${mn}:${pad(sc)}`;
  };
  const info = {
    title: (v.title || document.title.replace(/ - YouTube$/, '')).trim(),
    channel: (v.author || '').trim(),
    duration: Number.isFinite(lengthSec) ? secsToStamp(lengthSec) : '',
    published: (m.publishDate || '').slice(0, 10),
  };

  cleanup();
  return { segments, info };
}
