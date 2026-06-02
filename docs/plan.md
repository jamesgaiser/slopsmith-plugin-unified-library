# Unified Library — Implementation Plan

Merges duplicate PSARC + Sloppak/STEMS library entries into a single card, with
clickable format badges, a smarter convert button, and a settings screen.

---

## Problem

After a user converts a PSARC to sloppak, the library shows two entries for the
same song. The original PSARC card still has a greyed-out "Convert" button. There
is no obvious relationship between the two cards, and the user has to manage them
manually. The song mastery plugin adds a difficulty badge (lower-right of card);
format badges are top-right — both need to coexist without overlap.

---

## Naming conventions

Follow slopsmith's existing UI language:
- Card overlay badge: **STEMS** or **SLOPPAK** (purple/green, matching `formatBadge()`)
- Filter dropdowns / settings UI: **sloppak** (lowercase, matches filter labels)
- Internally: `'sloppak'` as the format identifier

The word "sloppak" and "STEMS" refer to the same underlying format — sloppak with
stem audio files gets the STEMS badge, without gets SLOPPAK. The settings UI says
"sloppak" (consistent with the format filter); the card badge says STEMS or SLOPPAK
depending on whether stems are present.

---

## Technical constraints (from research)

The library provider API only *adds* new sources — it cannot filter or suppress
entries from the built-in `local` provider. There is no `library:rendered` event.
The only viable approach is **DOM manipulation via MutationObserver** after cards
render. The Sloppak Converter plugin injects `button.sloppak-convert-btn` — we
can read and modify it but should not replace its click handler (it owns the
conversion logic).

---

## How cards are matched

PSARC and sloppak files for the same song share a base filename:
- `Down [311].psarc`
- `Down [311].sloppak`

Match key: `filename.replace(/\.(psarc|sloppak)$/, '').toLowerCase()`

Cards expose `data-play="<filename>"` and `data-artist`. The format badge uses
class `fmt-badge` in the top-right corner (`absolute top-2 right-2`).

---

## Approach

The sloppak card is the **primary** (default play target). Its card is kept visible;
the PSARC card is hidden. Both filenames are stored on the primary card so either
can be played on demand.

```
MutationObserver on #lib-grid (#lib-tree for list view)
  │
  ├─ On mutations: collect all .song-card[data-play] elements
  ├─ Group by base filename (strip extension)
  ├─ For groups with exactly one PSARC + one sloppak/STEMS card:
  │    ├─ Hide the PSARC card (CSS display:none + data-ul-hidden="1")
  │    ├─ Annotate sloppak card:
  │    │    data-ul-merged="1"
  │    │    data-ul-psarc="<psarcFilename>"
  │    │    data-ul-sloppak="<sloppakFilename>"
  │    ├─ Replace single .fmt-badge with dual clickable badges (see Badge Design)
  │    └─ Rename .sloppak-convert-btn text "Convert" → "↺ Re-Convert"
  └─ On provider switch / library refresh: re-run pass
```

---

## Badge design

Current single badge: `absolute top-2 right-2`

Dual badge layout — two pills side by side in the top-right corner. Each badge
is **clickable** and plays that format directly, bypassing the global default:

```
┌─────────────────────────────────┐
│                   [ PSARC ][ STEMS ] │   ← top-right, both clickable
│                                 │
│  Down                       ♡  │
│  311                            │
│  Lead  Rhythm  Bass  E Std      │
│  Lyrics  3:03              10% │   ← Song Mastery badge, lower-right
│  ↺ Re-Convert                  │
└─────────────────────────────────┘
```

- **Active/default badge** (sloppak): full opacity, full colour, cursor pointer
- **Secondary badge** (PSARC): same colour but `opacity-60`, cursor pointer
- Clicking either badge calls `playSong(thatFormatFilename)` immediately,
  ignoring the global default preference
- Tooltip on hover: "Play as STEMS" / "Play as PSARC"

Colours match existing `formatBadge()` palette:
- PSARC: `bg-blue-900/80 text-blue-200 border-blue-700`
- STEMS: `bg-purple-900/80 text-purple-200 border-purple-700`
- SLOPPAK (no stems): `bg-green-900/80 text-green-200 border-green-700`

---

## Primary card click

The main card click (artwork, title, anywhere except badges) plays the **global
default format**. The plugin wraps `window.playSong`:

```js
const origPlay = window.playSong;
window.playSong = async function(filename, ...args) {
    const card = document.querySelector(`.song-card[data-play="${CSS.escape(filename)}"]`);
    if (card?.dataset.ulMerged) {
        const pref = window._ul.defaultFormat;  // 'sloppak' | 'psarc'
        filename = pref === 'psarc'
            ? card.dataset.ulPsarc
            : card.dataset.ulSloppak;
    }
    return origPlay(filename, ...args);
};
```

No "ask" mode — the clickable badges already cover the "choose per play" case
without requiring a modal. If the user wants to override, they click the badge.

---

## Convert button

The Sloppak Converter plugin injects `button.sloppak-convert-btn` into each card.
When both formats exist:
- Change button text: `Convert → Sloppak` → `↺ Re-Convert`
- Keep the button enabled and its click handler intact (re-triggers full conversion)
- Button is already disabled/hidden by the converter when sloppak is up to date —
  we only need to rename it, not change behaviour

---

## Settings screen

Nav label: **Unified Library** (appears in sidebar).

```
Unified Library
───────────────────────────────────────────────────────

  [✓] Merge duplicate entries
       Hides the PSARC version when a sloppak conversion exists,
       combining both into one card.

  Default format when both are available:
     (●) sloppak   ← default
     ( ) PSARC

  Note: You can always play either format directly by clicking
  the PSARC or STEMS badge on a merged card.

  ─── Status ─────────────────────────────────────────────────
  Sloppak Converter: ✓ detected / ⚠ not installed
  X songs merged
```

Stored in localStorage key `unified_library`. Live-editable via `window._ul`.

Compact settings panel (`settings.html`):
```
  [✓] Merge duplicates
  Default: [sloppak ▾]
```

---

## Phases / checklist

### Phase 1 — Core merging (grid view)
- [ ] MutationObserver on `#lib-grid`
- [ ] Base-filename matcher for PSARC + sloppak pairs
- [ ] Keep sloppak card, hide PSARC card (`data-ul-hidden`, CSS display:none)
- [ ] Store both filenames on the surviving card (`data-ul-psarc`, `data-ul-sloppak`)
- [ ] Replace `.fmt-badge` with dual clickable badge HTML
- [ ] Badge click handlers → `playSong(thatFilename)` directly
- [ ] Rename `.sloppak-convert-btn` text → "↺ Re-Convert"
- [ ] `window._ul` live settings object + localStorage persistence

### Phase 2 — Play action
- [ ] `window.playSong` wrapper to redirect merged-card clicks to correct format
- [ ] Respects `window._ul.defaultFormat` ('sloppak' | 'psarc')

### Phase 3 — Settings screen
- [ ] `screen.html` — enable toggle + default format radio + status section
- [ ] `settings.html` — compact enable toggle + format dropdown
- [ ] Nav entry in `plugin.json`
- [ ] Live reload when settings change (re-run merge pass)

### Phase 4 — Tree/list view
- [ ] MutationObserver on `#lib-tree`
- [ ] Same merge logic on `.song-row[data-play]` elements
- [ ] Dual inline badges (matching `formatBadgeInline` style, both clickable)

### Phase 5 — Polish
- [ ] Badge tooltips ("Click to play as PSARC" / "Click to play as STEMS")
- [ ] Merged count in status section of settings screen (live)
- [ ] Edge case: same title+artist but different base filenames
      (secondary match on title+artist when filename match fails)
- [ ] Edge case: PSARC + plain sloppak (no stems) + STEMS variant (3-way)

---

## Resolved decisions

1. **Primary card: sloppak** — richer format, what users want to play. PSARC card
   is hidden. Both filenames stored as data attributes on the sloppak card.

2. **No "ask" modal** — the clickable badges already let users pick per-play without
   friction. A modal would add a click just to answer an obvious question.

3. **Naming**: card overlays say STEMS/SLOPPAK (matching `formatBadge()`); settings
   UI says "sloppak" (matching filter labels).

4. **Sloppak Converter cooperation**: we rename its button text only; its click
   handler and disabled logic are untouched.

5. **Provider non-local entries**: only merge `data-play` cards (local provider).
   Remote provider cards use `data-library-song` and have no PSARC duplicates.
