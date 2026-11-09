/* ============================================================
   ממשק ניהול — רביב דיגיטל
   עריכת טקסטים בכל עמודי האתר, שמירה מקומית ופרסום ל-GitHub
   ============================================================ */
(function () {
    'use strict';

    var PAGE = (location.pathname.split('/').pop() || 'index.html');
    if (!PAGE || PAGE === 'index.html#') PAGE = 'index.html';
    if (PAGE.charAt(PAGE.length - 1) === '/') PAGE = 'index.html';

    var STORE_KEY = 'rd_content_v1';
    var TOKEN_KEY = 'rd_gh_token';
    var PASS_HASH = '16ef49fbf7358f4f967f7e1d13b6f1d550d0d8018bec098e95f669a621cb9b4a';
    var GH = { owner: 'shlomoraviv', repo: 'Raviv-Digital', branch: 'main', file: 'content.js' };
    var SKIP_TAGS = /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|SVG|PATH|CANVAS|BR|IMG|INPUT|TEXTAREA|SELECT|OPTION|HR)$/;

    var editing = false;
    var dirty = false;
    var items = [];
    var bar = null;

    /* ---------- אחסון ---------- */
    function allData() {
        try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; }
        catch (e) { return {}; }
    }

    function saveData(data) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { }
    }

    /* ---------- מפתחות יציבים לטקסטים ---------- */
    function keyFor(el) {
        var parts = [];
        var node = el;
        while (node && node !== document.body && node.parentElement) {
            var idx = 0, s = node;
            while ((s = s.previousElementSibling)) idx++;
            parts.unshift(node.tagName.toLowerCase() + ':' + idx);
            node = node.parentElement;
        }
        return parts.join('>');
    }

    function textNodesOf(el) {
        var out = [];
        for (var i = 0; i < el.childNodes.length; i++) {
            var n = el.childNodes[i];
            if (n.nodeType === 3 && n.nodeValue && n.nodeValue.trim()) out.push(n);
        }
        return out;
    }

    function collect() {
        var out = [];
        var all = document.body.getElementsByTagName('*');
        for (var i = 0; i < all.length; i++) {
            var el = all[i];
            if (SKIP_TAGS.test(el.tagName.toUpperCase())) continue;
            if (el.closest('[data-rd-skip]')) continue;
            if (!textNodesOf(el).length) continue;
            out.push({ el: el, key: keyFor(el) });
        }
        return out;
    }

    /* ---------- החלת הטקסטים השמורים ---------- */
    function applySaved() {
        var data = allData()[PAGE];
        if (!data) return;
        var list = collect();
        for (var i = 0; i < list.length; i++) {
            var val = data[list[i].key];
            if (typeof val !== 'string') continue;
            setText(list[i].el, val);
        }
    }

    function setText(el, val) {
        var nodes = textNodesOf(el);
        if (!nodes.length) return;
        nodes[0].nodeValue = val;
        for (var i = 1; i < nodes.length; i++) nodes[i].nodeValue = '';
    }

    /* ---------- עיצוב ---------- */
    function injectCss() {
        var css = [
            '#rd-admin, #rd-admin * { box-sizing: border-box; }',
            '#rd-admin { font-family: "Heebo", sans-serif; direction: rtl; }',
            '#rd-admin-btn { position: fixed; bottom: 112px; left: 40px; z-index: 9998; width: 42px; height: 42px;',
            '  border-radius: 50%; border: 1px solid rgba(26,50,99,.18); background: #fff; color: #1A3263;',
            '  font-size: .95rem; cursor: pointer; box-shadow: 0 6px 18px rgba(15,23,42,.14); opacity: .55;',
            '  transition: all .25s ease; display: flex; align-items: center; justify-content: center; }',
            '#rd-admin-btn:hover { opacity: 1; transform: translateY(-2px); box-shadow: 0 12px 26px rgba(15,23,42,.2); }',
            '.dark #rd-admin-btn { background: #1e293b; color: #fcd34d; border-color: rgba(148,163,184,.35); }',
            '.rd-editing [contenteditable="true"] { outline: 1px dashed rgba(242,181,11,.75); outline-offset: 3px; border-radius: 4px; cursor: text; }',
            '.rd-editing [contenteditable="true"]:hover { background: rgba(242,181,11,.1); }',
            '.rd-editing [contenteditable="true"]:focus { outline: 2px solid #F2B50B; background: rgba(242,181,11,.08); }',
            '#rd-bar { position: fixed; bottom: 22px; left: 50%; transform: translateX(-50%); z-index: 10001;',
            '  display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; justify-content: center;',
            '  background: #1A3263; color: #fff; padding: .6rem .75rem; border-radius: 1rem;',
            '  box-shadow: 0 20px 45px -18px rgba(15,23,42,.7); max-width: calc(100vw - 24px); }',
            '#rd-bar .rd-tag { font-size: .78rem; font-weight: 800; display: flex; align-items: center; gap: .35rem; padding-inline-end: .35rem; }',
            '#rd-bar .rd-tag i { color: #F2B50B; }',
            '#rd-bar button, #rd-panel button { font-family: inherit; font-weight: 800; font-size: .8rem; border: 0;',
            '  border-radius: 9999px; padding: .5rem 1rem; cursor: pointer; transition: all .2s ease; display: inline-flex;',
            '  align-items: center; gap: .35rem; }',
            '#rd-bar button:hover { transform: translateY(-1px); }',
            '.rd-save { background: #34d399; color: #06331f; }',
            '.rd-pub { background: #F2B50B; color: #37353E; }',
            '.rd-cancel { background: rgba(255,255,255,.15); color: #fff; }',
            '.rd-exit { background: rgba(255,255,255,.08); color: #cbd5e1; }',
            '#rd-mask { position: fixed; inset: 0; z-index: 10002; background: rgba(8,15,30,.62);',
            '  display: flex; align-items: center; justify-content: center; padding: 1.2rem; backdrop-filter: blur(4px); }',
            '#rd-panel { background: #fff; color: #1e293b; width: 100%; max-width: 420px; border-radius: 1.5rem;',
            '  padding: 1.6rem; box-shadow: 0 40px 80px -30px rgba(0,0,0,.6); }',
            '.dark #rd-panel { background: #1e293b; color: #e2e8f0; }',
            '#rd-panel h3 { font-size: 1.15rem; font-weight: 900; margin: 0 0 .35rem; }',
            '#rd-panel p { font-size: .82rem; line-height: 1.7; color: #64748b; margin: 0 0 1rem; }',
            '.dark #rd-panel p { color: #94a3b8; }',
            '#rd-panel input { width: 100%; font-family: inherit; font-size: .95rem; padding: .8rem 1rem;',
            '  border: 1px solid #cbd5e1; border-radius: .85rem; margin-bottom: .9rem; text-align: right; background: #f8fafc; color: inherit; }',
            '.dark #rd-panel input { background: #0f172a; border-color: #334155; }',
            '#rd-panel input:focus { outline: 2px solid #F2B50B; border-color: #F2B50B; }',
            '.rd-row { display: flex; gap: .5rem; flex-wrap: wrap; }',
            '.rd-primary { background: #1A3263; color: #fff; }',
            '.rd-ghost { background: #eef2f7; color: #1A3263; }',
            '.dark .rd-ghost { background: #334155; color: #e2e8f0; }',
            '#rd-msg { font-size: .8rem; font-weight: 700; margin-top: .8rem; min-height: 1.1rem; color: #b91c1c; }',
            '#rd-msg.ok { color: #15803d; }',
            '.dark #rd-msg.ok { color: #4ade80; }',
            '#rd-toast { position: fixed; bottom: 96px; left: 50%; transform: translateX(-50%) translateY(14px); z-index: 10003;',
            '  background: #1A3263; color: #fff; font-size: .84rem; font-weight: 800; padding: .65rem 1.1rem;',
            '  border-radius: 9999px; opacity: 0; pointer-events: none; transition: all .3s ease; }',
            '#rd-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }',
            '@media (max-width: 640px) {',
            '  #rd-bar { border-radius: .85rem; gap: .35rem; padding: .5rem; }',
            '  #rd-bar button { padding: .45rem .7rem; font-size: .72rem; }',
            '  #rd-admin-btn { bottom: 96px; left: 18px; }',
            '}'
        ].join('\n');
        var s = document.createElement('style');
        s.id = 'rd-admin-style';
        s.textContent = css;
        document.head.appendChild(s);
    }

    function el(tag, cls, html) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (html != null) n.innerHTML = html;
        return n;
    }

    /* ---------- טוסט ---------- */
    function toast(msg) {
        var t = document.getElementById('rd-toast');
        if (!t) { t = el('div', '', ''); t.id = 'rd-toast'; document.getElementById('rd-admin').appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(toast._t);
        toast._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }

    /* ---------- פאנל סיסמה ---------- */
    function askPassword(onOk) {
        closeMask();
        var mask = el('div', ''); mask.id = 'rd-mask';
        var panel = el('div', ''); panel.id = 'rd-panel';
        panel.innerHTML =
            '<h3><i class="fa-solid fa-lock" style="color:#F2B50B"></i> כניסה לממשק הניהול</h3>' +
            '<p>הזינו את סיסמת הניהול כדי לערוך את הטקסטים באתר.</p>' +
            '<input id="rd-pass" type="password" autocomplete="off" placeholder="סיסמה" dir="rtl">' +
            '<div class="rd-row">' +
            '  <button type="button" class="rd-primary" id="rd-pass-ok">כניסה <i class="fa-solid fa-arrow-left"></i></button>' +
            '  <button type="button" class="rd-ghost" id="rd-pass-no">ביטול</button>' +
            '</div>' +
            '<div id="rd-msg"></div>';
        mask.appendChild(panel);
        document.getElementById('rd-admin').appendChild(mask);

        var input = panel.querySelector('#rd-pass');
        var msg = panel.querySelector('#rd-msg');
        input.focus();

        function submit() {
            var val = input.value.replace(/\s+/g, ' ').trim();
            if (!val) { msg.textContent = 'יש להזין סיסמה.'; return; }
            sha256(val).then(function (hash) {
                if (hash === PASS_HASH) { closeMask(); onOk(); }
                else { msg.textContent = 'סיסמה שגויה, נסו שוב.'; input.select(); }
            }).catch(function () { msg.textContent = 'שגיאה בבדיקת הסיסמה.'; });
        }

        panel.querySelector('#rd-pass-ok').onclick = submit;
        panel.querySelector('#rd-pass-no').onclick = closeMask;
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
        mask.addEventListener('click', function (e) { if (e.target === mask) closeMask(); });
    }

    function closeMask() {
        var m = document.getElementById('rd-mask');
        if (m) m.remove();
    }

    function sha256(str) {
        var bytes = new TextEncoder().encode(str);
        return crypto.subtle.digest('SHA-256', bytes).then(function (buf) {
            var arr = Array.prototype.slice.call(new Uint8Array(buf));
            return arr.map(function (b) { return ('00' + b.toString(16)).slice(-2); }).join('');
        });
    }

    /* ---------- מצב עריכה ---------- */
    function startEditing() {
        if (editing) return;
        editing = true;
        items = collect();
        document.body.classList.add('rd-editing');
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            it.orig = textNodesOf(it.el).map(function (n) { return n.nodeValue; }).join('');
            it.el.setAttribute('contenteditable', 'true');
            it.el.setAttribute('spellcheck', 'false');
            it.el.dataset.rdKey = it.key;
        }
        // לא מפעילים קישורים וכפתורים בזמן עריכה
        document.addEventListener('click', blockClicks, true);
        document.addEventListener('keydown', blockEnter, true);
        document.addEventListener('input', onInput, true);
        buildBar();
        toast('מצב עריכה פעיל — לחצו על טקסט כדי לשנות אותו');
    }

    function stopEditing(restore) {
        if (!editing) return;
        if (restore) {
            for (var i = 0; i < items.length; i++) {
                if (items[i].orig != null) setText(items[i].el, items[i].orig);
            }
        }
        for (var j = 0; j < items.length; j++) {
            items[j].el.removeAttribute('contenteditable');
            items[j].el.removeAttribute('spellcheck');
            delete items[j].el.dataset.rdKey;
        }
        editing = false;
        dirty = false;
        document.body.classList.remove('rd-editing');
        document.removeEventListener('click', blockClicks, true);
        document.removeEventListener('keydown', blockEnter, true);
        document.removeEventListener('input', onInput, true);
        if (bar) { bar.remove(); bar = null; }
    }

    function blockClicks(e) {
        if (!editing) return;
        var t = e.target.closest('#rd-admin');
        if (t) return;
        // עריכת טקסטים בלבד — לא מנווטים ולא פותחים חלונות
        if (e.target.closest('a, button, summary, label, [onclick]')) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    function blockEnter(e) {
        if (!editing) return;
        if (e.key === 'Enter' && !e.ctrlKey) {
            var t = e.target;
            if (t && t.isContentEditable) e.preventDefault();
        }
        if (e.key === 'Escape' && !e.target.closest('#rd-admin')) {
            e.preventDefault();
            toast('לחצו "סיום" כדי לצאת ממצב העריכה');
        }
    }

    function onInput(e) {
        if (!editing) return;
        var t = e.target;
        if (!t || !t.dataset || !t.dataset.rdKey) return;
        dirty = true;
        var data = allData();
        if (!data[PAGE]) data[PAGE] = {};
        data[PAGE][t.dataset.rdKey] = t.innerText.replace(/\u00a0/g, ' ').trim();
        saveData(data);
        if (bar) bar.querySelector('.rd-status').textContent = 'שינויים לא פורסמו';
    }

    function buildBar() {
        if (bar) bar.remove();
        bar = el('div', '');
        bar.id = 'rd-bar';
        bar.setAttribute('data-rd-skip', '');
        bar.innerHTML =
            '<span class="rd-tag"><i class="fa-solid fa-pen-to-square"></i> עריכת טקסטים <span class="rd-status"></span></span>' +
            '<button type="button" class="rd-save"><i class="fa-solid fa-floppy-disk"></i> שמירה מקומית</button>' +
            '<button type="button" class="rd-pub"><i class="fa-solid fa-cloud-arrow-up"></i> פרסום לאתר</button>' +
            '<button type="button" class="rd-cancel"><i class="fa-solid fa-rotate-left"></i> ביטול</button>' +
            '<button type="button" class="rd-exit"><i class="fa-solid fa-check"></i> סיום</button>';

        bar.querySelector('.rd-save').onclick = function () {
            dirty = false;
            bar.querySelector('.rd-status').textContent = 'נשמר במחשב';
            toast('השינויים נשמרו מקומית');
        };

        bar.querySelector('.rd-cancel').onclick = function () {
            if (!confirm('לבטל את כל השינויים בעמוד הזה ולחזור לטקסט המקורי?')) return;
            var data = allData();
            delete data[PAGE];
            saveData(data);
            stopEditing(true);
            toast('השינויים בוטלו');
            setTimeout(function () { location.reload(); }, 700);
        };

        bar.querySelector('.rd-exit').onclick = function () {
            stopEditing(false);
            toast('יצאת ממצב העריכה');
        };

        bar.querySelector('.rd-pub').onclick = openPublish;

        document.getElementById('rd-admin').appendChild(bar);
    }

    /* ---------- פרסום ל-GitHub ---------- */
    function openPublish() {
        closeMask();
        var mask = el('div', ''); mask.id = 'rd-mask';
        var panel = el('div', ''); panel.id = 'rd-panel';
        var saved = localStorage.getItem(TOKEN_KEY) || '';
        panel.innerHTML =
            '<h3><i class="fa-solid fa-cloud-arrow-up" style="color:#F2B50B"></i> פרסום האתר</h3>' +
            '<p>הטקסטים נשמרים בקובץ <b>content.js</b> בריפו, ו-GitHub Pages בונה את האתר מחדש (בדרך כלל תוך דקה). ' +
            'כדי לפרסם צריך טוקן GitHub עם הרשאת <b>repo</b> — הוא נשמר רק בדפדפן שלכם ולא נכנס לאתר.</p>' +
            '<input id="rd-token" type="password" autocomplete="off" placeholder="ghp_... / github_pat_..." dir="ltr">' +
            '<div class="rd-row">' +
            '  <button type="button" class="rd-primary" id="rd-pub-go"><i class="fa-solid fa-cloud-arrow-up"></i> פרסם עכשיו</button>' +
            '  <button type="button" class="rd-ghost" id="rd-pub-close">סגירה</button>' +
            '</div>' +
            '<div id="rd-msg"></div>';
        mask.appendChild(panel);
        document.getElementById('rd-admin').appendChild(mask);

        var input = panel.querySelector('#rd-token');
        if (saved) input.value = saved;
        var msg = panel.querySelector('#rd-msg');
        input.focus();

        panel.querySelector('#rd-pub-close').onclick = closeMask;
        mask.addEventListener('click', function (e) { if (e.target === mask) closeMask(); });

        panel.querySelector('#rd-pub-go').onclick = function () {
            var token = input.value.trim();
            if (!token) { msg.textContent = 'יש להזין טוקן GitHub.'; return; }
            localStorage.setItem(TOKEN_KEY, token);
            msg.className = '';
            msg.textContent = 'מעלה את השינויים...';
            publish(token).then(function (res) {
                msg.className = 'ok';
                msg.textContent = res;
            }).catch(function (err) {
                msg.className = '';
                msg.textContent = 'הפרסום נכשל: ' + (err && err.message ? err.message : 'שגיאה לא ידועה');
            });
        };
    }

    function b64utf8(str) {
        var bytes = new TextEncoder().encode(str);
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    function ghHeaders(token) {
        return {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json'
        };
    }

    function publish(token) {
        var data = allData();
        var body = '/* טקסטים שנערכו מממשק הניהול — רביב דיגיטל */\nwindow.SITE_CONTENT = ' +
            JSON.stringify(data, null, 2) + ';\n';
        var api = 'https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + GH.file;

        return fetch(api + '?ref=' + GH.branch, { headers: ghHeaders(token), cache: 'no-store' })
            .then(function (r) {
                if (r.status === 404) return null;
                if (r.status === 401) throw new Error('הטוקן לא תקין או שפג תוקפו');
                if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ('שגיאה ' + r.status)); });
                return r.json();
            })
            .then(function (cur) {
                var payload = {
                    message: 'עדכון טקסטים מהממשק הניהולי',
                    content: b64utf8(body),
                    branch: GH.branch
                };
                if (cur && cur.sha) payload.sha = cur.sha;
                return fetch(api, {
                    method: 'PUT',
                    headers: ghHeaders(token),
                    body: JSON.stringify(payload)
                });
            })
            .then(function (r) {
                if (r.status === 401 || r.status === 403) throw new Error('אין הרשאה לכתוב לריפו (צריך טוקן עם repo)');
                if (!r.ok) return r.json().then(function (j) { throw new Error(j.message || ('שגיאה ' + r.status)); });
                dirty = false;
                if (bar) bar.querySelector('.rd-status').textContent = 'פורסם';
                return 'פורסם בהצלחה. האתר יתעדכן תוך דקה.';
            });
    }

    /* ---------- אתחול ---------- */
    function init() {
        injectCss();
        var root = el('div', ''); root.id = 'rd-admin'; root.setAttribute('data-rd-skip', '');
        document.body.appendChild(root);

        var btn = el('button', '', '<i class="fa-solid fa-sliders"></i>');
        btn.id = 'rd-admin-btn';
        btn.type = 'button';
        btn.title = 'ניהול האתר';
        btn.setAttribute('aria-label', 'ניהול האתר');
        btn.onclick = function () {
            if (editing) { stopEditing(false); return; }
            askPassword(startEditing);
        };
        root.appendChild(btn);

        applySaved();
        window.addEventListener('load', function () { if (!editing) applySaved(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
