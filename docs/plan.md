# Unified Library — Implementation Plan

Merges duplicate PSARC + Sloppak/STEMS library entries into a single card, with
dual format badges and a smarter convert button.

---

## Problem

After a user converts a PSARC to sloppak, the library shows two entries for the
same song. The original PSARC card still has a greyed-out "Convert" button. There
is no obvious relationship between the two cards, and the user has to manage them
manually. The song mastery plugin adds a difficulty badge (lower-right of card);
format badges are top-right — both need to coexist without overlap.

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

```
MutationObserver on #lib-grid (#lib-tree for list view)
  │
  ├─ On mutations: collect all .song-card[data-play] elements
  ├─ Group by base filename (strip extension)
  ├─ For groups with exactly one PSARC + one sloppak/STEMS card:
  │    ├─ Hide the sloppak card (CSS display:none + data-ul-hidden="1")
  │    ├─ Annotate PSARC card (data-ul-merged="1", data-ul-pair="<sloppakFilename>")
  │    ├─ Replace the single fmt-badge with dual badges (see Badge Design)
  │    ├─ Modify .sloppak-convert-btn text from "Convert" → "Re-Convert"
  │    └─ Wire the card's primary click to the preferred format (see Settings)
  └─ On provider switch / library refresh: re-run pass
```

---

## Badge design

Current single badge: `absolute top-2 right-2`

Dual badge layout — two pills side by side in the same top-right slot:
```
[ PSARC ][ STEMS ]      ← both shown when merged
```
The secondary (non-preferred) badge is slightly muted (lower opacity, no border).
The active/preferred badge keeps full styling.

Colours match existing palette:
- PSARC: `bg-blue-900/80 text-blue-200 border-blue-700`
- STEMS: `bg-purple-900/80 text-purple-200 border-purple-700`
- SLOPPAK (no stems): `bg-green-900/80 text-green-200 border-green-700`

Song Mastery difficulty badge is `lower-right` — no overlap.

---

## Convert button

The Sloppak Converter plugin injects `button.sloppak-convert-btn` into each card.
When both formats exist:
- Change button text: `Convert → Sloppak` → `↺ Re-Convert`
- Keep the button enabled and its click handler intact (re-triggers full conversion)
- Button is already disabled/hidden by the converter when sloppak is up to date —
  we only need to rename it, not change behaviour

---

## Primary click / play action

When a merged card is clicked (or Enter pressed), the plugin intercepts
`window.playSong` and substitutes the preferred format's filename:

```js
const origPlay = window.playSong;
window.playSong = async function(filename, ...args) {
    const pref = _getPreference(filename);  // 'sloppak' | 'psarc' | 'ask'
    if (pref === 'sloppak') {
        const pair = _pairFor(filename);
        if (pair) filename = pair;
    }
    return origPlay(filename, ...args);
};
```

---

## Settings

**Plugin settings screen (screen.html):**

```
Unified Library
───────────────────────────────────────

  [✓] Merge duplicate entries
       Combines PSARC and converted Sloppak versions into one card.

  When both formats are available, play:
     ( ) Sloppak / STEMS   ← default
     ( ) PSARC
     ( ) Ask each time     (shows a modal on click)

  ─── About ─────────────────────────────
  Requires the Sloppak Converter plugin for the Re-Convert button.
  Per-song overrides: right-click a card → "Play as PSARC / STEMS".
```

Stored in localStorage key `unified_library`.

---

## Phases / checklist

### Phase 1 — Core merging (grid view)
- [ ] MutationObserver on `#lib-grid`
- [ ] Base-filename matcher for PSARC + sloppak pairs
- [ ] Hide duplicate card (CSS), annotate primary with `data-ul-merged`
- [ ] Replace single `.fmt-badge` with dual-badge HTML
- [ ] Rename `.sloppak-convert-btn` text → "↺ Re-Convert"
- [ ] `window._smDD` pattern → `window._ul` live settings object
- [ ] localStorage persistence

### Phase 2 — Play action
- [ ] `window.playSong` wrapper to redirect to preferred format
- [ ] "Ask" mode: small inline popover on click showing both options
- [ ] Remember per-song override in localStorage

### Phase 3 — Settings screen
- [ ] `screen.html` with enable toggle + format preference radio
- [ ] `settings.html` compact panel (enable toggle + preference)
- [ ] Nav entry in `plugin.json`
- [ ] Live settings update (no reload needed)

### Phase 4 — Tree/list view
- [ ] MutationObserver on `#lib-tree`
- [ ] Same merge logic applied to `.song-row[data-play]` elements
- [ ] Dual inline badge (formatBadgeInline style)

### Phase 5 — Polish
- [ ] Right-click context menu: "Play as PSARC" / "Play as STEMS"
- [ ] Merged count indicator in library header ("X duplicates merged")
- [ ] Handle edge case: same title+artist but different base filenames
      (fallback: match on title+artist when no filename match)
- [ ] Handle 3-way: PSARC + plain sloppak + STEMS variant

---

## Open questions

1. **Should the PSARC card be the primary, or the sloppak?**
   The sloppak is richer (stems, editable) but the PSARC is the "original."
   Recommendation: prefer sloppak/STEMS as primary (it's what you want to play),
   but keep the PSARC data-play on the card so re-convert targets the right file.

2. **What if Sloppak Converter is not installed?**
   Merge still happens; the convert button won't be present so nothing to rename.
   Show a note in settings if the converter is not detected.

3. **Tree view timing**
   The tree renders lazily as artists are expanded. The MutationObserver handles
   this naturally — it fires on any new nodes added to the tree container.

4. **Provider non-local entries**
   Only merge `data-play` cards (local provider). Remote provider cards have
   `data-library-song` instead and don't have PSARC duplicates.
