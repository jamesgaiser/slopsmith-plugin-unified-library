# slopsmith-plugin-unified-library

A [Slopsmith](https://github.com/jamesgaiser/slopsmith) plugin that merges duplicate PSARC and sloppak/STEMS library entries into a single card, so each song appears only once regardless of how many formats you have on disk.

## Features

- **Merged cards** — when both a PSARC and a sloppak/STEMS version of a song exist, the PSARC card is hidden and the sloppak card is kept, combining both into one
- **Dual format badges** — each merged card shows a clickable **PSARC** and **STEMS** (or **SLOPPAK**) badge in the corner; click either to play that format directly, bypassing the default preference
- **Default format** — configurable preference (sloppak or PSARC) controls what plays when you click the card itself rather than a badge
- **↺ Re-Convert button** — replaces the Sloppak Converter's "Convert" button on merged cards; forces reconversion even when a sloppak already exists, preserving the original format (STEMS or plain SLOPPAK)
- **PSARC filter awareness** — when the format filter is set to PSARC-only, cards that already have a sloppak counterpart show "↺ Re-Convert" instead of "Convert"
- **Grid and tree/list view** — merging works in both the card grid and the tree/artist list view
- **Live settings** — toggling the plugin on/off or changing the default format takes effect immediately without a page reload

## Prerequisites

- Slopsmith (web/Docker or Desktop)
- [Sloppak Converter plugin](https://github.com/jamesgaiser/slopsmith) — required for the Re-Convert button; the merge and badge features work without it

## Installation

### Slopsmith web / Docker

```bash
cd /path/to/slopsmith/plugins
git clone https://github.com/jamesgaiser/slopsmith-plugin-unified-library.git unified_library
docker compose restart
```

### Slopsmith Desktop

Clone into the Desktop app's user plugins directory (shown in **Settings → Plugins**).

| Platform | Plugins directory |
|----------|-------------------|
| Windows  | `%APPDATA%\slopsmith-desktop\plugins\` |
| macOS    | `~/Library/Application Support/slopsmith-desktop/plugins/` |
| Linux    | `~/.config/slopsmith-desktop/plugins/` |

```bash
# macOS / Linux
git clone https://github.com/jamesgaiser/slopsmith-plugin-unified-library.git \
  ~/.config/slopsmith-desktop/plugins/unified_library
```

> **Windows:** Do not clone under `C:\Program Files\Slopsmith` — Windows protects that path. Use the user-writable directory above.

After restart the plugin is active with no further setup needed.

## Settings

Open the **Unified Library** screen from the navigation sidebar, or find the compact controls under **Settings → Plugins → Unified Library**.

| Setting | Description |
|---------|-------------|
| Enabled | Toggle merging on or off; all cards are restored to their original state when disabled |
| Default format | **sloppak** (recommended) or **PSARC** — controls which format plays when you click a merged card rather than one of its badges |

## Development

No build step. Edit `screen.js`, then copy it (along with `screen.html`, `settings.html`, and `plugin.json`) to your plugins directory and restart the app (Desktop) or reload the page (web).

### Debug utility

A debug helper is exposed on `window._ul` that lists unmatched PSARC/sloppak entries in the current view:

```js
_ul._debug()              // show all unmatched entries
_ul._debug('machinehead') // filter by name
```

Output shows the raw filename and computed base name for each entry, which is useful for diagnosing songs that fail to merge.

### Live settings

Settings can be read and changed from the browser console without reloading:

```js
window._ul.defaultFormat = 'psarc'   // change default format
window._ul._reload()                  // re-apply merge logic
window._ul                            // inspect all current settings
```

## Storage

Plugin settings are persisted under `localStorage` key `unified_library`:

```json
{
  "enabled": true,
  "defaultFormat": "sloppak",
  "sloppakBases": ["311beautiful", "machinehead - bush"],
  "sloppakLabels": { "311beautiful": "STEMS", "machinehead - bush": "STEMS" }
}
```

`sloppakBases` and `sloppakLabels` are an internal cache used to detect Re-Convert candidates when the format filter hides sloppak cards from the DOM. They are populated automatically as you browse the library and do not need to be set manually.

## License

MIT
