(function () {
    'use strict';

    if (window.__unifiedLibraryLoaded) return;
    window.__unifiedLibraryLoaded = true;

    const STORAGE_KEY = 'unified_library';

    // ── Settings ─────────────────────────────────────────────────────────────

    window._ul = Object.assign({
        enabled:       true,
        defaultFormat: 'sloppak',  // 'sloppak' | 'psarc'
    }, (function () {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
        catch (_) { return {}; }
    })());

    function _save() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window._ul)); } catch (_) {}
    }

    // ── Filename helpers ──────────────────────────────────────────────────────

    function _decode(encoded) {
        try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
    }

    // Strip extension to get a match key
    function _baseName(filename) {
        return filename.replace(/\.(psarc|sloppak)$/i, '').toLowerCase().trim();
    }

    function _ext(filename) {
        return (filename.match(/\.(psarc|sloppak)$/i) || [])[1]?.toLowerCase() || '';
    }

    // ── Badge HTML ────────────────────────────────────────────────────────────

    function _dualBadgeHtml(psarcFile, sloppakFile, sloppakLabel, sloppakColour) {
        const isDefault = window._ul.defaultFormat === 'sloppak';
        // PSARC: muted when sloppak is default; full when psarc is default
        const psarcOpacity  = isDefault ? 'opacity-60 hover:opacity-100' : 'hover:opacity-90';
        const stemOpacity   = isDefault ? 'hover:opacity-90' : 'opacity-60 hover:opacity-100';
        return `<span class="ul-fmt-badges absolute top-2 right-2 flex gap-1 z-10">` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `bg-blue-900/80 text-blue-200 border border-blue-700 ` +
                `${psarcOpacity} transition-opacity cursor-pointer"` +
                ` data-ul-play="${encodeURIComponent(psarcFile)}" title="Play as PSARC">PSARC</button>` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `${sloppakColour} border ` +
                `${stemOpacity} transition-opacity cursor-pointer"` +
                ` data-ul-play="${encodeURIComponent(sloppakFile)}" title="Play as ${sloppakLabel}">${sloppakLabel}</button>` +
        `</span>`;
    }

    // ── Core merge pass ───────────────────────────────────────────────────────

    function _mergePass() {
        const grid = document.getElementById('lib-grid');
        if (!grid) return;

        if (!window._ul.enabled) {
            _unmergeAll(grid);
            return;
        }

        // Collect visible local cards (skip ones we already hid)
        const cards = Array.from(grid.querySelectorAll('.song-card[data-play]'))
            .filter(c => !c.dataset.ulHidden);

        // Group by base filename
        const byBase = new Map();
        for (const card of cards) {
            const filename = _decode(card.dataset.play);
            const ext = _ext(filename);
            if (ext !== 'psarc' && ext !== 'sloppak') continue;

            const base = _baseName(filename);
            if (!byBase.has(base)) byBase.set(base, {});
            byBase.get(base)[ext] = card;
        }

        // Process pairs
        for (const [, { psarc: psarcCard, sloppak: sloppakCard }] of byBase) {
            if (!psarcCard || !sloppakCard) continue;
            if (sloppakCard.dataset.ulMerged) continue;  // already merged

            const psarcFile   = _decode(psarcCard.dataset.play);
            const sloppakFile = _decode(sloppakCard.dataset.play);

            // Detect STEMS vs plain SLOPPAK from existing badge text
            const existingBadge = sloppakCard.querySelector('.fmt-badge');
            const isStems = existingBadge?.textContent?.trim() === 'STEMS';
            const sloppakLabel  = isStems ? 'STEMS'  : 'SLOPPAK';
            const sloppakColour = isStems
                ? 'bg-purple-900/80 text-purple-200 border-purple-700'
                : 'bg-green-900/80 text-green-200 border-green-700';

            // Hide PSARC card
            psarcCard.style.display = 'none';
            psarcCard.dataset.ulHidden = '1';

            // Annotate sloppak card
            sloppakCard.dataset.ulMerged  = '1';
            sloppakCard.dataset.ulPsarc   = psarcFile;
            sloppakCard.dataset.ulSloppak = sloppakFile;

            // Replace badge with dual clickable badges
            existingBadge?.remove();
            sloppakCard.querySelector('.ul-fmt-badges')?.remove();
            const cardArt = sloppakCard.querySelector('.card-art') || sloppakCard;
            cardArt.insertAdjacentHTML('beforeend', _dualBadgeHtml(psarcFile, sloppakFile, sloppakLabel, sloppakColour));

            // Re-Convert button
            _wireReconvert(psarcCard, sloppakCard);
        }
    }

    // Inject "↺ Re-Convert" on the sloppak card that delegates to the hidden PSARC card's button
    function _wireReconvert(psarcCard, sloppakCard) {
        if (sloppakCard.dataset.ulReconvert) return;  // already wired

        // The Sloppak Converter may not be installed; do nothing if no button found
        const psarcConvertBtn = psarcCard.querySelector('button.sloppak-convert-btn');
        if (!psarcConvertBtn) return;

        // If the sloppak card itself has a convert button, just rename it
        const ownConvertBtn = sloppakCard.querySelector('button.sloppak-convert-btn');
        if (ownConvertBtn) {
            ownConvertBtn.textContent = '↺ Re-Convert';
            sloppakCard.dataset.ulReconvert = '1';
            return;
        }

        // Otherwise inject one that dispatches the click to the hidden PSARC card's button
        const btn = document.createElement('button');
        btn.className   = psarcConvertBtn.className;
        btn.textContent = '↺ Re-Convert';
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            // The Sloppak Converter listens via event delegation and walks up to
            // the nearest .song-card[data-play] — dispatch from the PSARC card's
            // button so it finds the PSARC filename, not the sloppak filename.
            psarcConvertBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        });

        // Append into the same area as the arrangements (inside .p-4)
        const body = sloppakCard.querySelector('.p-4') || sloppakCard;
        body.appendChild(btn);
        sloppakCard.dataset.ulReconvert = '1';
    }

    // Undo all merges (called when plugin is disabled)
    function _unmergeAll(grid) {
        // Restore hidden PSARC cards
        grid.querySelectorAll('.song-card[data-ul-hidden]').forEach(c => {
            c.style.display = '';
            delete c.dataset.ulHidden;
        });
        // Restore original badges on sloppak cards and remove our additions
        grid.querySelectorAll('.song-card[data-ul-merged]').forEach(c => {
            c.querySelector('.ul-fmt-badges')?.remove();
            delete c.dataset.ulMerged;
            delete c.dataset.ulPsarc;
            delete c.dataset.ulSloppak;
            delete c.dataset.ulReconvert;
            // Re-run so the card gets its original badge back on next render
        });
    }

    // ── playSong wrapper ──────────────────────────────────────────────────────

    const _origPlaySong = window.playSong;
    window.playSong = async function (filename, ...args) {
        if (window._ul.enabled) {
            // Find a merged card that owns this filename
            const card = Array.from(document.querySelectorAll('.song-card[data-ul-merged]'))
                .find(c => c.dataset.ulSloppak === filename || c.dataset.ulPsarc === filename);

            if (card) {
                filename = window._ul.defaultFormat === 'psarc'
                    ? card.dataset.ulPsarc
                    : card.dataset.ulSloppak;
            }
        }
        return _origPlaySong(filename, ...args);
    };

    // ── Badge click handler (event delegation) ────────────────────────────────

    // Capture phase so we can stop propagation before the card's own click handler
    document.addEventListener('click', function (e) {
        const btn = e.target.closest('.ul-badge-btn');
        if (!btn) return;
        e.stopPropagation();
        e.preventDefault();
        const filename = _decode(btn.dataset.ulPlay);
        if (filename) _origPlaySong(filename);
    }, true);

    // ── MutationObserver ──────────────────────────────────────────────────────

    let _mergeTimer = null;
    const _observer = new MutationObserver(function () {
        // Debounce so rapid card additions (full grid render) only trigger one pass.
        // The 150ms delay also lets the Sloppak Converter inject its buttons first.
        clearTimeout(_mergeTimer);
        _mergeTimer = setTimeout(_mergePass, 150);
    });

    function _attach() {
        const grid = document.getElementById('lib-grid');
        if (!grid) return;
        _observer.disconnect();
        _observer.observe(grid, { childList: true, subtree: true });
        _mergePass();
    }

    // Re-attach whenever the user navigates to a library screen
    if (window.slopsmith) {
        window.slopsmith.on('screen:changed', function (e) {
            const id = e.detail?.id;
            if (id === 'home' || id === 'favorites') {
                setTimeout(_attach, 50);
            }
        });
    }

    // Run immediately in case library is already on screen
    _attach();

})();
