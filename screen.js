(function () {
    'use strict';

    if (window.__unifiedLibraryLoaded) return;
    window.__unifiedLibraryLoaded = true;

    const STORAGE_KEY  = 'unified_library';
    const SLOPPAK_API  = '/api/plugins/sloppak_converter';

    // ── Settings ─────────────────────────────────────────────────────────────

    window._ul = Object.assign({
        enabled:       true,
        defaultFormat: 'sloppak',  // 'sloppak' | 'psarc'
    }, (function () {
        try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
        catch (_) { return {}; }
    })());

    // Persisted set of base names known to have a sloppak/STEMS counterpart.
    const _sloppakBases  = new Set(window._ul.sloppakBases  || []);
    // Maps base name → 'STEMS' | 'SLOPPAK' — needed for correct split param when reconverting
    const _sloppakLabels = new Map(Object.entries(window._ul.sloppakLabels || {}));

    function _save() {
        window._ul.sloppakBases  = Array.from(_sloppakBases);
        window._ul.sloppakLabels = Object.fromEntries(_sloppakLabels);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(window._ul)); } catch (_) {}
    }

    // ── Filename helpers ──────────────────────────────────────────────────────

    function _decode(encoded) {
        try { return decodeURIComponent(encoded); } catch (_) { return encoded; }
    }

    // Strip directory prefix, extension, and the _p suffix Rocksmith PSARCs carry
    function _baseName(filename) {
        const name = filename.split('/').pop();
        return name
            .replace(/\.(psarc|sloppak)$/i, '')
            .replace(/_p$/i, '')
            .replace(/[\s_]+/g, ' ')   // normalize underscores/spaces so "Song_-_Artist" matches "Song - Artist"
            .toLowerCase().trim();
    }

    function _ext(filename) {
        return (filename.match(/\.(psarc|sloppak)$/i) || [])[1]?.toLowerCase() || '';
    }

    // ── Badge HTML ────────────────────────────────────────────────────────────

    // Absolute-positioned badges for grid cards
    function _dualBadgeHtml(psarcFile, sloppakFile, sloppakLabel, sloppakColour) {
        const isDefault = window._ul.defaultFormat === 'sloppak';
        const psarcOpacity = isDefault ? 'opacity-60 hover:opacity-100' : 'hover:opacity-90';
        const stemOpacity  = isDefault ? 'hover:opacity-90' : 'opacity-60 hover:opacity-100';
        return `<span class="ul-fmt-badges absolute top-2 right-2 flex gap-1 z-10">` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `bg-blue-900/80 text-blue-200 border border-blue-700 ` +
                `${psarcOpacity} transition-opacity cursor-pointer"` +
                ` data-ul-play="${encodeURIComponent(psarcFile)}" title="Click to play as PSARC">PSARC</button>` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `${sloppakColour} border ` +
                `${stemOpacity} transition-opacity cursor-pointer"` +
                ` data-ul-play="${encodeURIComponent(sloppakFile)}" title="Click to play as ${sloppakLabel}">${sloppakLabel}</button>` +
        `</span>`;
    }

    // Inline badges for tree rows — matches formatBadgeInline() style
    function _dualBadgeHtmlInline(psarcFile, sloppakFile, sloppakLabel, sloppakColour) {
        const isDefault = window._ul.defaultFormat === 'sloppak';
        const psarcOpacity = isDefault ? 'opacity-60 hover:opacity-100' : '';
        const stemOpacity  = isDefault ? '' : 'opacity-60 hover:opacity-100';
        return `<span class="ul-fmt-badges-inline inline-flex items-center gap-1">` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `bg-blue-900/60 text-blue-300 ${psarcOpacity} cursor-pointer transition-opacity"` +
                ` data-ul-play="${encodeURIComponent(psarcFile)}" title="Click to play as PSARC">PSARC</button>` +
            `<button class="ul-badge-btn px-1.5 py-0.5 rounded text-[10px] font-bold ` +
                `${sloppakColour} ${stemOpacity} cursor-pointer transition-opacity"` +
                ` data-ul-play="${encodeURIComponent(sloppakFile)}" title="Click to play as ${sloppakLabel}">${sloppakLabel}</button>` +
        `</span>`;
    }

    // ── Reconvert API call ────────────────────────────────────────────────────

    // Calls the Sloppak Converter's bulk endpoint with reconvert:true so the
    // server overwrites the existing sloppak instead of skipping it.
    async function _callReconvert(psarcFile, isStems) {
        try {
            const r = await fetch(`${SLOPPAK_API}/enqueue_bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filenames: [psarcFile], split: isStems, reconvert: true }),
            });
            if (!r.ok) console.warn('[unified-library] reconvert failed:', r.status);
        } catch (e) {
            console.warn('[unified-library] reconvert error:', e);
        }
    }

    // ── STEMS detection ───────────────────────────────────────────────────────

    // Returns 'STEMS' or 'SLOPPAK' for a sloppak entry in either view
    function _detectSloppakLabel(el, type) {
        // Stored from a previous merge pass — reliable after _reload
        if (el.dataset.ulLabel) return el.dataset.ulLabel;
        if (type === 'card') {
            // Grid cards: badge has class fmt-badge
            return el.querySelector('.fmt-badge')?.textContent?.trim() === 'STEMS' ? 'STEMS' : 'SLOPPAK';
        }
        // Tree rows: scan all spans for STEMS/SLOPPAK text
        for (const span of el.querySelectorAll('span')) {
            const t = span.textContent.trim();
            if (t === 'STEMS')   return 'STEMS';
            if (t === 'SLOPPAK') return 'SLOPPAK';
        }
        return 'SLOPPAK';
    }

    // ── Core merge logic (shared between grid and tree) ───────────────────────

    function _mergeContainer(container, type) {
        const selector = type === 'card' ? '.song-card[data-play]' : '.song-row[data-play]';

        const entries = Array.from(container.querySelectorAll(selector))
            .filter(c => !c.dataset.ulHidden);

        // Group by base filename
        const byBase = new Map();
        for (const el of entries) {
            const filename = _decode(el.dataset.play);
            const ext = _ext(filename);
            if (ext !== 'psarc' && ext !== 'sloppak') continue;
            const base = _baseName(filename);
            if (!byBase.has(base)) byBase.set(base, {});
            byBase.get(base)[ext] = el;
        }

        // Update sloppak base + label cache from visible sloppak entries
        let cacheChanged = false;
        for (const [base, { sloppak }] of byBase) {
            if (!sloppak) continue;
            const label = _detectSloppakLabel(sloppak, type);
            if (!_sloppakBases.has(base)) { _sloppakBases.add(base); cacheChanged = true; }
            if (_sloppakLabels.get(base) !== label) { _sloppakLabels.set(base, label); cacheChanged = true; }
        }
        if (cacheChanged) _save();

        // Process matched pairs
        for (const [, { psarc, sloppak }] of byBase) {
            if (!psarc || !sloppak || sloppak.dataset.ulMerged) continue;

            const psarcFile   = _decode(psarc.dataset.play);
            const sloppakFile = _decode(sloppak.dataset.play);
            const label       = _detectSloppakLabel(sloppak, type);
            const isStems     = label === 'STEMS';
            const colour      = isStems
                ? (type === 'card' ? 'bg-purple-900/80 text-purple-200 border-purple-700'
                                   : 'bg-purple-900/60 text-purple-300')
                : (type === 'card' ? 'bg-green-900/80 text-green-200 border-green-700'
                                   : 'bg-green-900/60 text-green-300');

            // Hide PSARC entry
            psarc.style.display = 'none';
            psarc.dataset.ulHidden = '1';

            // Annotate sloppak entry
            sloppak.dataset.ulMerged  = '1';
            sloppak.dataset.ulPsarc   = psarcFile;
            sloppak.dataset.ulSloppak = sloppakFile;
            sloppak.dataset.ulLabel   = label;

            // Replace format badge with dual clickable badges
            if (type === 'card') {
                sloppak.querySelector('.fmt-badge')?.remove();
                sloppak.querySelector('.ul-fmt-badges')?.remove();
                const cardArt = sloppak.querySelector('.card-art') || sloppak;
                cardArt.insertAdjacentHTML('beforeend', _dualBadgeHtml(psarcFile, sloppakFile, label, colour));
                _wireReconvert(psarc, sloppak);
            } else {
                sloppak.querySelector('.ul-fmt-badges-inline')?.remove();
                // Remove the existing inline format badge from the title container
                const titleEl = sloppak.querySelector('.flex-1.min-w-0');
                if (titleEl) {
                    for (const span of titleEl.querySelectorAll('span')) {
                        const t = span.textContent.trim();
                        if (t === 'STEMS' || t === 'SLOPPAK' || t === 'PSARC') { span.remove(); break; }
                    }
                    titleEl.insertAdjacentHTML('beforeend', _dualBadgeHtmlInline(psarcFile, sloppakFile, label, colour));
                }
                _wireReconvertRow(psarc, sloppak);
            }
        }

        // Rename Convert → Re-Convert on unmatched PSARC entries whose sloppak is known
        let needsCacheRefresh = false;
        for (const [base, { psarc, sloppak }] of byBase) {
            if (!psarc || sloppak || psarc.dataset.ulReconvertOnly) continue;
            const inCache    = _sloppakBases.has(base);
            const convertBtn = psarc.querySelector('button.sloppak-convert-btn');
            if (!inCache) { needsCacheRefresh = true; continue; }
            if (!convertBtn) continue;
            window._ul._converterSeen = true;

            const psarcFile = _decode(psarc.dataset.play);
            const isStems   = _sloppakLabels.get(base) === 'STEMS';
            const newBtn    = _makeReconvertBtn(convertBtn, psarcFile, isStems);
            // Hide original (keeps Converter's handler intact for unmerge restore)
            convertBtn.style.display = 'none';
            convertBtn.dataset.ulHiddenByUl = '1';
            convertBtn.insertAdjacentElement('afterend', newBtn);
            psarc.dataset.ulReconvertOnly = '1';
        }
        if (needsCacheRefresh) _refreshSloppakCache();
    }

    function _mergePass() {
        const grid = document.getElementById('lib-grid') || document.getElementById('fav-grid');
        const tree = document.getElementById('lib-tree') || document.getElementById('fav-tree');
        if (!grid && !tree) return;

        if (!window._ul.enabled) {
            if (grid) _unmergeAll(grid);
            if (tree) _unmergeAll(tree);
            return;
        }

        if (grid) _mergeContainer(grid, 'card');
        if (tree) _mergeContainer(tree, 'row');

        // Keep the settings screen status count current as merges happen
        if (document.getElementById('ul-status-merged')) _updateSettingsUI();
    }

    // ── Re-Convert wiring ─────────────────────────────────────────────────────

    function _makeReconvertBtn(psarcConvertBtn, psarcFile, isStems) {
        const btn = psarcConvertBtn.cloneNode(false);
        // Strip the two identifiers the Sloppak Converter uses to find and reset buttons.
        // We keep the visual styling classes (padding, colour, font) from the clone.
        btn.classList.remove('sloppak-convert-btn');
        delete btn.dataset.sloppakFilename;
        btn.textContent = '↺ Re-Convert';
        btn.dataset.ulReconvertBtn = '1';
        btn.addEventListener('click', async function (e) {
            e.stopPropagation();
            btn.disabled = true;
            btn.textContent = 'Queued…';
            await _callReconvert(psarcFile, isStems);
        });
        return btn;
    }

    // Grid cards: Re-Convert button goes in .p-4 body
    function _wireReconvert(psarcCard, sloppakCard) {
        if (sloppakCard.dataset.ulReconvert) return;

        const psarcConvertBtn = psarcCard.querySelector('button.sloppak-convert-btn');
        if (!psarcConvertBtn) return;
        window._ul._converterSeen = true;

        const psarcFile = _decode(psarcCard.dataset.play);
        const isStems   = sloppakCard.dataset.ulLabel === 'STEMS';
        const btn       = _makeReconvertBtn(psarcConvertBtn, psarcFile, isStems);

        const ownConvertBtn = sloppakCard.querySelector('button.sloppak-convert-btn');
        if (ownConvertBtn) {
            ownConvertBtn.replaceWith(btn);
        } else {
            const body = sloppakCard.querySelector('.p-4') || sloppakCard;
            body.appendChild(btn);
        }
        sloppakCard.dataset.ulReconvert = '1';
    }

    // Tree rows: Re-Convert button goes in the trailing metadata container
    function _wireReconvertRow(psarcRow, sloppakRow) {
        if (sloppakRow.dataset.ulReconvert) return;

        const psarcConvertBtn = psarcRow.querySelector('button.sloppak-convert-btn');
        if (!psarcConvertBtn) return;
        window._ul._converterSeen = true;

        const psarcFile = _decode(psarcRow.dataset.play);
        const isStems   = sloppakRow.dataset.ulLabel === 'STEMS';
        const btn       = _makeReconvertBtn(psarcConvertBtn, psarcFile, isStems);

        const ownConvertBtn = sloppakRow.querySelector('button.sloppak-convert-btn');
        if (ownConvertBtn) {
            ownConvertBtn.replaceWith(btn);
        } else {
            const tail = sloppakRow.querySelector(':scope > .flex.items-center.flex-shrink-0')
                      || sloppakRow.querySelector(':scope > div:last-child')
                      || sloppakRow;
            tail.appendChild(btn);
        }
        sloppakRow.dataset.ulReconvert = '1';
    }

    // ── Sloppak cache refresh ─────────────────────────────────────────────────

    let _cacheRefreshing = false;
    function _refreshSloppakCache() {
        if (_cacheRefreshing) return;
        _cacheRefreshing = true;
        fetch('/api/library?format=sloppak&size=10000&page=0')
            .then(r => r.json())
            .then(data => {
                const songs = data.songs || data.items || [];
                let changed = false;
                for (const song of songs) {
                    const filename = song.filename || song.file || '';
                    if (!filename) continue;
                    const base = _baseName(filename);
                    if (!_sloppakBases.has(base)) { _sloppakBases.add(base); changed = true; }
                }
                if (changed) _save();
                _mergePass();
            })
            .catch(e => { console.warn('[unified-library] sloppak cache refresh failed:', e); })
            .finally(() => { _cacheRefreshing = false; });
    }

    // ── Unmerge all ───────────────────────────────────────────────────────────

    function _unmergeAll(container) {
        container.querySelectorAll('.song-card[data-ul-hidden], .song-row[data-ul-hidden]').forEach(c => {
            c.style.display = '';
            delete c.dataset.ulHidden;
        });
        container.querySelectorAll('.song-card[data-ul-merged], .song-row[data-ul-merged]').forEach(c => {
            c.querySelector('.ul-fmt-badges')?.remove();
            c.querySelector('.ul-fmt-badges-inline')?.remove();
            c.querySelectorAll('button[data-ul-reconvert-btn]').forEach(b => b.remove());
            delete c.dataset.ulMerged;
            delete c.dataset.ulPsarc;
            delete c.dataset.ulSloppak;
            delete c.dataset.ulReconvert;
            // data-ul-label kept so _mergePass can re-detect STEMS after reload
        });
        container.querySelectorAll('.song-card[data-ul-reconvert-only], .song-row[data-ul-reconvert-only]').forEach(c => {
            // Remove our Re-Convert button and restore the original Converter button
            c.querySelectorAll('button[data-ul-reconvert-btn]').forEach(b => b.remove());
            const orig = c.querySelector('button.sloppak-convert-btn[data-ul-hidden-by-ul]');
            if (orig) { orig.style.display = ''; delete orig.dataset.ulHiddenByUl; }
            delete c.dataset.ulReconvertOnly;
        });
    }

    // ── playSong wrapper ──────────────────────────────────────────────────────

    const _origPlaySong = window.playSong;
    window.playSong = async function (filename, ...args) {
        if (window._ul.enabled) {
            const decoded = _decode(filename);
            const entry = Array.from(document.querySelectorAll('.song-card[data-ul-merged], .song-row[data-ul-merged]'))
                .find(c => c.dataset.ulSloppak === decoded || c.dataset.ulPsarc === decoded);

            if (entry) {
                filename = window._ul.defaultFormat === 'psarc'
                    ? entry.dataset.ulPsarc
                    : entry.dataset.ulSloppak;
            }
        }
        return _origPlaySong(filename, ...args);
    };

    // ── Badge click handler (event delegation) ────────────────────────────────

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
    const _observer = new MutationObserver(function (mutations) {
        const isOurs = mutations.every(m =>
            Array.from(m.addedNodes).every(n =>
                n.classList?.contains('ul-fmt-badges') ||
                n.classList?.contains('ul-fmt-badges-inline') ||
                n.classList?.contains('ul-badge-btn')
            )
        );
        if (isOurs) return;
        clearTimeout(_mergeTimer);
        _mergeTimer = setTimeout(_mergePass, 200);
    });

    function _attachToContainers(containers) {
        _observer.disconnect();
        for (const c of containers) _observer.observe(c, { childList: true, subtree: true });

        const formatEl = document.getElementById('lib-format');
        if (formatEl && !formatEl.dataset.ulListening) {
            formatEl.addEventListener('change', function () {
                if (this.value === 'psarc') _refreshSloppakCache();
            });
            formatEl.dataset.ulListening = '1';
        }

        _mergePass();
        if (formatEl?.value === 'psarc') _refreshSloppakCache();
    }

    function _attach() {
        const grid = document.getElementById('lib-grid') || document.getElementById('fav-grid');
        const tree = document.getElementById('lib-tree') || document.getElementById('fav-tree');
        const found = [grid, tree].filter(Boolean);

        if (found.length) {
            _attachToContainers(found);
            return;
        }

        const bodyObs = new MutationObserver(function () {
            const g = document.getElementById('lib-grid') || document.getElementById('fav-grid');
            const t = document.getElementById('lib-tree') || document.getElementById('fav-tree');
            const f = [g, t].filter(Boolean);
            if (f.length) { bodyObs.disconnect(); _attachToContainers(f); }
        });
        bodyObs.observe(document.body, { childList: true, subtree: true });
    }

    // ── Settings screen UI ───────────────────────────────────────────────────

    function _updateSettingsUI() {
        const fmtSection  = document.getElementById('ul-fmt-section');
        const converterEl = document.getElementById('ul-status-converter');
        const mergedEl    = document.getElementById('ul-status-merged');

        if (fmtSection) {
            const off = window._ul.enabled === false;
            fmtSection.style.opacity       = off ? '0.4' : '1';
            fmtSection.style.pointerEvents = off ? 'none' : '';
        }

        if (converterEl) {
            const seen = !!(window._ul._converterSeen || document.querySelector('button.sloppak-convert-btn'));
            converterEl.textContent = seen ? '✓ detected' : '⚠ not installed';
            converterEl.className   = seen ? 'text-green-400' : 'text-yellow-500';
        }

        if (mergedEl) {
            const merged    = document.querySelectorAll('.song-card[data-ul-merged], .song-row[data-ul-merged]').length;
            const psarcOnly = document.querySelectorAll('.song-card[data-ul-reconvert-only], .song-row[data-ul-reconvert-only]').length;
            const parts = [];
            if (merged    > 0) parts.push(`${merged} song${merged !== 1 ? 's' : ''} merged`);
            if (psarcOnly > 0) parts.push(`${psarcOnly} PSARC-only with sloppak available`);
            mergedEl.textContent = parts.length > 0
                ? parts.join(' · ')
                : (window._ul.enabled === false ? 'Plugin disabled.' : 'No songs merged yet — visit the library.');
        }
    }

    function _applyToggleState() {
        const btn = document.getElementById('ul-toggle');
        if (!btn) return;
        const on = window._ul.enabled !== false;
        btn.style.backgroundColor = on ? '#2563eb' : '#4b5563';
        btn.setAttribute('aria-checked', String(on));
        const knob = btn.querySelector('span');
        if (knob) knob.style.transform = on ? 'translateX(1.25rem)' : 'translateX(0)';
    }

    function _initSettingsUI() {
        const toggleBtn = document.getElementById('ul-toggle');
        if (!toggleBtn) return;

        if (!toggleBtn.dataset.ulWired) {
            toggleBtn.dataset.ulWired = '1';
            toggleBtn.addEventListener('click', function () {
                window._ul.enabled = !window._ul.enabled;
                _applyToggleState();
                window._ul._reload();
                _updateSettingsUI();
            });
            document.querySelectorAll('input[name="ul-fmt"]').forEach(r => {
                r.addEventListener('change', function () {
                    window._ul.defaultFormat = this.value;
                    window._ul._reload();
                });
            });
        }

        _applyToggleState();
        const isPsarc = window._ul.defaultFormat === 'psarc';
        const sloppakRadio = document.getElementById('ul-fmt-sloppak');
        const psarcRadio   = document.getElementById('ul-fmt-psarc');
        if (sloppakRadio) sloppakRadio.checked = !isPsarc;
        if (psarcRadio)   psarcRadio.checked   =  isPsarc;
        _updateSettingsUI();
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    if (window.slopsmith) {
        window.slopsmith.on('screen:changed', function (e) {
            const id = e.detail?.id;
            if (id === 'home' || id === 'favorites') _attach();
            if (id === 'plugin-unified_library') _initSettingsUI();
        });
    }

    _initSettingsUI();
    _attach();

    // Debug helper: lists unmatched PSARC/sloppak entries in the current view.
    // Usage: _ul._debug()  or  _ul._debug('machinehead')
    window._ul._debug = function (filter) {
        const containers = [
            document.getElementById('lib-grid'), document.getElementById('fav-grid'),
            document.getElementById('lib-tree'), document.getElementById('fav-tree'),
        ].filter(Boolean);

        for (const container of containers) {
            const isRow = container.id.includes('tree');
            const entries = Array.from(container.querySelectorAll(
                isRow ? '.song-row[data-play]' : '.song-card[data-play]'
            ));
            const byBase = new Map();
            for (const el of entries) {
                const fn  = _decode(el.dataset.play);
                const ext = _ext(fn);
                if (ext !== 'psarc' && ext !== 'sloppak') continue;
                const base = _baseName(fn);
                if (!byBase.has(base)) byBase.set(base, { psarc: null, sloppak: null });
                byBase.get(base)[ext] = fn;
            }
            const unmatched = [...byBase.entries()].filter(([, p]) => !p.psarc || !p.sloppak);
            if (!unmatched.length) { console.log('[ul] all matched in', container.id); continue; }
            console.log('[ul] unmatched in', container.id + ':');
            for (const [base, pair] of unmatched) {
                if (filter && !base.includes(filter.toLowerCase())) continue;
                if (pair.psarc)   console.log('  PSARC only  :', pair.psarc,   '\n    base →', base);
                if (pair.sloppak) console.log('  SLOPPAK only:', pair.sloppak, '\n    base →', base);
            }
        }
    };

    window._ul._reload = function () {
        _save();
        const grid = document.getElementById('lib-grid') || document.getElementById('fav-grid');
        const tree = document.getElementById('lib-tree') || document.getElementById('fav-tree');
        if (grid) _unmergeAll(grid);
        if (tree) _unmergeAll(tree);
        _mergePass();
    };

})();
