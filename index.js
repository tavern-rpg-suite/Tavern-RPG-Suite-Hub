import { extension_settings, getContext } from '../../../extensions.js';
import { saveSettingsDebounced, getRequestHeaders } from '../../../../script.js';

/* ============================================================
   TAVERN RPG SUITE — HUB
   ------------------------------------------------------------
   Twelve extensions means twelve trips to "Install extension", and most people
   stop after the first. This is the one URL that offers the rest.

   The catalogue is NOT in this file. It is fetched from the organisation, so a
   new extension appears for everyone who already has the hub — they never have
   to update it. If the network is unavailable the bundled copy is used instead,
   which means the hub still works offline, just with an older list.
   ============================================================ */

const MODULE_NAME = 'rpg_suite_hub';
const CATALOG_URL = 'https://raw.githubusercontent.com/tavern-rpg-suite/.github/main/suite.json';
const LOCAL_CATALOG = 'suite.json';   // shipped fallback, resolved next to this file

const defaultSettings = {
    language: 'en',
    lastSeen: [],       // urls the person has already been shown, so "new" means new to THEM
    dismissed: false,
    // false puts everything in data/<user>/extensions, which is what a single-user
    // install wants and what SillyTavern's own button does by default
    globalInstall: false,
    greeted: false,     // has the first run already happened
    autoUpdate: 'manual',   // 'manual' | 'auto'
    lastCheck: 0        // when the automatic check last ran, so it is not every reload
};

let settings = {};
let catalog = [];
let busy = false;

/* ---------- plumbing ---------- */
function loadSettings() {
    if (!extension_settings[MODULE_NAME]) extension_settings[MODULE_NAME] = {};
    settings = Object.assign({}, defaultSettings, extension_settings[MODULE_NAME]);
    if (!Array.isArray(settings.lastSeen)) settings.lastSeen = [];
}
function save() { extension_settings[MODULE_NAME] = settings; saveSettingsDebounced(); }
function esc(x) { return String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const RU = () => settings.language === 'ru';

const I18N = {
    en: {
        title: 'Tavern RPG Suite',
        intro: 'Everything here works on its own; installed together they talk to each other.',
        lang: 'Language:',
        counts: '{have} of {all} installed',
        stChecking: 'checking…', stReady: 'up to date', stMissing: 'not installed',
        stUpdate: 'update available', stZip: 'installed from a zip', stWorking: 'working…',
        stInstalled: 'installed',
        preset: 'preset — download by hand',
        bInstall: 'Install', bUpdate: 'Update', bOpen: 'Open',
        delTip: 'Remove this extension',
        delAsk: 'Remove {name}?\n\nThe folder is deleted. Its settings stay, so reinstalling later brings your configuration back.',
        delDone: '{name} removed. Reload the page.',
        delFail: 'Could not remove {name} — use the delete button in the Extensions panel.',
        allInstall: 'Install the rest ({n})', allUpdate: 'Update {n}',
        reload: 'Reload SillyTavern',
        done: 'Done. Reload the page.',
        failone: 'Could not install {name} — try its page.',
        failoneFolder: 'Could not install {name}. A folder called "{folder}" is probably still there — delete it by hand and try again.',
        failoneWhy: 'Could not install {name}. The server said: {why}',
        delFailWhy: 'Could not remove {name}. The server said: {why}',
        failupd: 'Could not update {name}.',
        zipHint: 'Installed from a zip, so there is no repository to update from. Reinstall it here and updating will work.',
        allset: 'Everything is installed and up to date.',
        coreDone: 'Core installed. Reload the page.',
        coreFail: 'Could not install the core automatically — use its Install button below.',
        needgit: 'Installing needs git on the machine running SillyTavern.',
        offline: 'Showing the list bundled with the hub.',
        updMode: 'Updates:', updManual: 'Ask me', updAuto: 'Automatic',
        globalLbl: 'Install for all users',
        globalHint: 'Only for multi-user setups. Off installs into your own user folder.',
        connTitle: 'Shared connection',
        connHint: 'One key for the whole suite. Every extension uses this unless you have given it its own — and any of them still can, this is the fallback, not a rule.',
        connUrl: 'Endpoint', connKey: 'API key', connModel: 'Model',
        connShared: 'shared', connSharedUrl: 'shared endpoint',
        connUseShared: 'use shared',
        connNowShared: '{name} now uses the shared connection.',
        connSummary: '{shared} shared · {own} own',
        connNone: 'No suite extensions have loaded yet.',
        connLocal: 'That looks like a local backend — no key is needed, and /v1 is added for you.',
        connKeyLocal: 'not needed for a local backend',
        connLocalFilled: 'Local endpoint: the key field was filled with a placeholder, since local servers ignore it. Replace it if yours does not.'
    },
    ru: {
        title: 'Tavern RPG Suite',
        intro: 'Всё здесь работает по отдельности; вместе они разговаривают друг с другом.',
        lang: 'Язык:',
        counts: 'установлено {have} из {all}',
        stChecking: 'проверяю…', stReady: 'свежее', stMissing: 'не установлено',
        stUpdate: 'есть обновление', stZip: 'из архива', stWorking: 'работаю…',
        stInstalled: 'установлено',
        preset: 'пресет — скачать вручную',
        bInstall: 'Поставить', bUpdate: 'Обновить', bOpen: 'Открыть',
        delTip: 'Удалить это расширение',
        delAsk: 'Удалить {name}?\n\nПапка будет удалена. Настройки останутся — поставишь заново, и твоя конфигурация вернётся.',
        delDone: '{name} удалено. Перезагрузи страницу.',
        delFail: 'Не удалось удалить {name} — воспользуйся кнопкой удаления в панели Extensions.',
        allInstall: 'Поставить остальное ({n})', allUpdate: 'Обновить {n}',
        reload: 'Перезагрузить таверну',
        done: 'Готово. Перезагрузи страницу.',
        failone: 'Не удалось поставить {name} — загляни на страницу.',
        failoneFolder: 'Не удалось поставить {name}. Скорее всего, папка «{folder}» всё ещё на месте — удали её вручную и попробуй снова.',
        failoneWhy: 'Не удалось поставить {name}. Сервер ответил: {why}',
        delFailWhy: 'Не удалось удалить {name}. Сервер ответил: {why}',
        failupd: 'Не удалось обновить {name}.',
        zipHint: 'Поставлено из архива — обновлять неоткуда. Переустанови здесь, и обновление заработает.',
        allset: 'Всё установлено и свежее.',
        coreDone: 'Ядро установлено. Перезагрузи страницу.',
        coreFail: 'Не удалось поставить ядро само — нажми «Поставить» в его строке.',
        needgit: 'Для установки нужен git на машине с таверной.',
        offline: 'Показываю список, вшитый в хаб.',
        updMode: 'Обновления:', updManual: 'Спрашивать', updAuto: 'Автоматически',
        globalLbl: 'Ставить для всех пользователей',
        globalHint: 'Только для многопользовательского режима. Выключено — ставит в твою папку.',
        connTitle: 'Общее подключение',
        connHint: 'Один ключ на весь набор. Все расширения берут его отсюда, если им не задали своё — а задать своё по-прежнему можно любому, это запасной вариант, а не правило.',
        connUrl: 'Адрес', connKey: 'Ключ', connModel: 'Модель',
        connShared: 'общее', connSharedUrl: 'общий адрес',
        connUseShared: 'на общее',
        connNowShared: '{name} переведено на общее подключение.',
        connSummary: '{shared} на общем · {own} со своим',
        connNone: 'Расширения набора ещё не загрузились.',
        connLocal: 'Похоже на локальный бэкенд — ключ не нужен, /v1 допишется само.',
        connKeyLocal: 'для локального бэкенда не нужен',
        connLocalFilled: 'Локальный адрес: ключ заполнен заглушкой — локальные серверы его игнорируют. Замени, если твой не игнорирует.'
    }
};
function t(k, v) {
    let s = (I18N[RU() ? 'ru' : 'en'] || I18N.en)[k] || k;
    if (v) for (const x of Object.keys(v)) s = s.replace(new RegExp('\\{' + x + '\\}', 'g'), v[x]);
    return s;
}

/* ---------- is it already here? ----------
   Asked of extension_settings rather than of SillyTavern's extension list: every
   module in the suite writes its own settings key on first load, and that key is
   stable across renames of the folder. */
/* Deriving the folder from the URL was wrong: SillyTavern names it after the repo
   only when IT did the cloning. Anything installed from a zip keeps whatever the zip
   called it — "RPG Map & Locations Engine" with spaces, not "RPG-Map-Locations-Engine"
   — and git then looks for a folder that is not there. So the real names are asked
   for, and matched loosely enough to survive spaces, dashes and ampersands. */
let installedFolders = null;

async function loadFolders() {
    // GET, not POST. This was asked for with the wrong method, so the list came back
    // empty every time; the folder name then fell back to the one in the URL, and
    // deleting "RPG Game Companion" went looking for "RPG-Game-Companion" and found
    // nothing. Everything downstream of this was guessing.
    try {
        const r = await fetch('/api/extensions/discover', { headers: getRequestHeaders() });
        if (r.ok) {
            const d = await r.json();
            const list = Array.isArray(d) ? d : (d?.extensions || []);
            // Names come back as "third-party/RPG-Phone". Everything that takes an
            // extensionName wants the bare folder — a slash in it is mangled by the
            // server's filename sanitiser, which is why deleting and version checks
            // both failed while installing worked (that one takes a URL).
            const rows = list.map(x => {
                const full = (typeof x === 'string') ? x : (x?.name || x?.path || '');
                return { full, name: String(full).replace(/^.*[\/\\]/, ''), type: (typeof x === 'object' && x?.type) || null };
            }).filter(x => x.name);
            if (rows.length) { installedFolders = rows; return; }
        }
    } catch (e) { console.warn('[Suite Hub] discover failed:', e); }
    try {
        const ctx = getContext();
        const names = ctx?.extensionNames || ctx?.extensions;
        if (Array.isArray(names) && names.length) {
            installedFolders = names.map(n => ({ full: String(n), name: String(n).replace(/^.*[\/\\]/, ''), type: null }));
            return;
        }
    } catch (e) { }
    installedFolders = [];
}

// The list also says whether a folder is the user's own or shared, which is exactly
// what install, update and delete need — better than making the person tick a box
// and hoping they picked the same one as last time.
function entryFor(url) {
    const repo = norm(String(url || '').replace(/\/+$/, '').split('/').pop().replace(/\.git$/, ''));
    if (!installedFolders || !installedFolders.length) return null;
    return installedFolders.find(f => norm(f.name) === repo)
        || (repo.length >= 6 ? installedFolders.find(f => norm(f.name).startsWith(repo)) : null)
        || null;
}
function isGlobalFor(url) {
    const e = entryFor(url);
    if (e && e.type) return String(e.type).toLowerCase() === 'global';
    return !!settings.globalInstall;
}

const norm = (x) => String(x || '').toLowerCase().replace(/^third-party[\/\\]/, '').replace(/[^a-z0-9]/g, '');

function folderOf(url) {
    const repo = String(url || '').replace(/\/+$/, '').split('/').pop().replace(/\.git$/, '');
    if (!installedFolders || !installedFolders.length) return repo;
    const want = norm(repo);
    // exact, then "the folder starts with the repo name" (RPG-Status-Bar-Bonds for
    // RPG-Status-Bar), then the other way round.
    // Only exact, or a folder that EXTENDS the repo name (RPG-Status-Bar-Bonds for
    // RPG-Status-Bar). The reverse direction used to be allowed too, and that is what
    // made a deleted extension look installed: "rpgphone".startsWith("rpg") is true,
    // so any short folder name claimed everything that began with it.
    const e = entryFor(url);
    return e ? e.name : repo;
}

function folderKnown(url) {
    const repo = String(url || '').replace(/\/+$/, '').split('/').pop().replace(/\.git$/, '');
    return !!(installedFolders && installedFolders.length && folderOf(url) !== repo)
        || !!(installedFolders || []).some(f => norm(f) === norm(repo));
}

function isInstalled(item) {
    if (!item || !item.url || item.preset) return false;
    // The folder on disk is the only honest answer. Settings were the first attempt
    // and they lie: deleting an extension leaves its settings key behind for ever,
    // so a removed extension went on reporting itself as installed.
    if (installedFolders && installedFolders.length) {
        const repo = norm(String(item.url).replace(/\/+$/, '').split('/').pop().replace(/\.git$/, ''));
        return !!entryFor(item.url);
    }
    // Only while the folder list is unavailable: better than claiming nothing is there.
    try { return !!(item.key && extension_settings[item.key]); } catch (e) { return false; }
}

/* ---------- the catalogue ---------- */
async function fetchCatalog() {
    try {
        const r = await fetch(CATALOG_URL + '?t=' + Date.now(), { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const d = await r.json();
        if (Array.isArray(d?.extensions) && d.extensions.length) return { list: d.extensions, remote: true };
        throw new Error('empty catalogue');
    } catch (e) {
        console.warn('[Suite Hub] remote catalogue unavailable:', e);
        try {
            const url = new URL(LOCAL_CATALOG, import.meta.url).href;
            const r = await fetch(url);
            const d = await r.json();
            return { list: d.extensions || [], remote: false };
        } catch (e2) {
            console.error('[Suite Hub] bundled catalogue unreadable:', e2);
            return { list: [], remote: false };
        }
    }
}

/* ---------- updating ----------
   SillyTavern clones a repo into a folder named after it, so the folder can be
   derived from the URL rather than guessed. If the endpoint is missing or shaped
   differently in someone's build, we say so plainly and point at the built-in
   update button instead of failing silently. */
/* The server explains itself in the response body — "already exists", "not a valid
   git repository", "admin only" — and that text used to be swallowed into a generic
   message. It is now put in front of the person, because every time something here
   broke, the answer was already in that string. */
async function serverSays(res) {
    let detail = '';
    try {
        const txt = await res.text();
        try { const j = JSON.parse(txt); detail = j.error || j.message || txt; }
        catch (e) { detail = txt; }
    } catch (e) { }
    return String(detail || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 300);
}

async function installOne(url) {
    const res = await fetch('/api/extensions/install', {
        method: 'POST',
        headers: getRequestHeaders(),
        body: JSON.stringify({ url, global: !!settings.globalInstall })
    });
    if (!res.ok) {
        const detail = await serverSays(res);
        console.error('[Suite Hub] install refused:', res.status, detail, '| url:', url, '| global:', !!settings.globalInstall);
        const err = new Error(`HTTP ${res.status}${detail ? ': ' + detail : ''}`);
        err.status = res.status; err.detail = detail;
        throw err;
    }
    return true;
}

async function updateOne(url) {
    const res = await fetch('/api/extensions/update', {
        method: 'POST',
        headers: getRequestHeaders(),
        // Where it actually lives, as reported by SillyTavern — not where the box in
        // the settings says new installs should go.
        body: JSON.stringify({ extensionName: folderOf(url), global: isGlobalFor(url) })
    });
    if (!res.ok) {
        let detail = '';
        try { detail = await res.text(); } catch (e) { }
        throw new Error(`HTTP ${res.status} ${detail}`.trim());
    }
    let out = {};
    try { out = await res.json(); } catch (e) { }
    return out;   // { isUpToDate, shortCommitHash, ... } on builds that report it
}

/* ============================================================
   THE SHARED CONNECTION
   Every extension in the suite already borrows a key it does not have: if its own
   fields are empty it reads them from Tavern RPG Engine. That made one profile out
   of fifteen, but it was invisible — to see who was using what you had to open
   fifteen panels.

   This edits that one source directly, and lists who follows it and who does not.
   Nothing is written into another extension's settings behind your back: the only
   button that touches them is "use the shared one", and it only clears fields.
   ============================================================ */
const SHARED_SOURCE = 'tavern_rpg_engine';

/* Not a secret and not pretending to be one: local backends accept anything here, and
   a recognisable word beats the "sk-..." someone would otherwise invent. */
const LOCAL_KEY = 'local';

// key: the settings key each extension writes; label: what to call it in the list.
// Taken from KEY_SOURCES and the catalogue, so a new extension only has to be added
// to suite.json to appear here.
const CONN_KEYS = {
    tavern_rpg_engine: 'Tavern RPG Engine',
    rpg_map_engine: 'RPG Map & Locations',
    rpg_diary: 'RPG Diary',
    rpg_vitals: 'RPG Vitals',
    rpg_equipment: 'RPG Equipment',
    rpg_vendors: 'RPG Vendors',
    rpg_status_bar: 'RPG Status Bar & Bonds',
    tavern_bonds_engine: 'Bonds engine',
    rpg_info_box: 'RPG Scene Card',
    dual_model_thoughts: 'Dual-Model Thoughts',
    rpg_game_companion: 'RPG Game Companion',
    character_lens: 'Character Lens',
    tavern_doors: 'Tavern Doors',
    rpg_codex: 'RPG Codex',
    rpg_phone: 'RPG Phone',
    rpg_living_scene: 'RPG Living Scene',
    rpg_dungeons: 'RPG Dungeons'
};

function shared() {
    if (!extension_settings[SHARED_SOURCE]) extension_settings[SHARED_SOURCE] = {};
    return extension_settings[SHARED_SOURCE];
}

function isLocalUrl(url) {
    const u = String(url || '').toLowerCase();
    if (!u) return false;
    return /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)([:/]|$)/.test(u)
        || /:(5001|5000|8080|8000|1234|11434|5002)(\/|$)/.test(u)
        || /192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\./.test(u);
}

/* An extension follows the shared profile when it has nothing of its own to use.
   The borrowing code requires BOTH a key and a model before it will use its own —
   except that a local backend has no key to give. Demanding one there means typing
   a fake value into every panel purely to be counted as configured, so a local
   endpoint plus a model is treated as a complete profile in its own right. */
function connStateOf(key) {
    const x = extension_settings[key];
    if (!x) return { present: false };
    const local = isLocalUrl(x.baseUrl);
    const own = !!(x.model && (x.apiKey || local));
    return { present: true, own, local, model: x.model || '', url: x.baseUrl || '' };
}

function connRows() {
    return Object.keys(CONN_KEYS)
        .filter(k => k !== SHARED_SOURCE && extension_settings[k])
        .map(k => ({ key: k, name: CONN_KEYS[k], ...connStateOf(k) }));
}

function useSharedFor(key) {
    const x = extension_settings[key];
    if (!x) return;
    // Cleared, not deleted: the fields stay so the panel still renders them, and the
    // borrowing code treats empty as "ask the shared profile".
    x.apiKey = '';
    x.model = '';
    x.baseUrl = '';
    saveSettingsDebounced();
    renderConn();
    toastr.info(t('connNowShared', { name: CONN_KEYS[key] || key }));
}

/* Local servers ignore the key, but every extension in the suite borrows the shared
   profile with the rule `apiKey && model` and skips a keyless one — then reports
   "no API key", or falls through to a sibling whose key belongs to a different
   provider and comes back with a 401. So the placeholder is written into the profile
   itself, whenever it is touched, rather than only when the URL field changes.
   Returns 'filled' when it just added the placeholder, so the caller can say so. */
function normalizeShared() {
    try {
        const s = shared();
        if (!s) return null;
        const key = String(s.apiKey || '').trim();
        if (isLocalUrl(s.baseUrl)) {
            if (!key) { s.apiKey = LOCAL_KEY; saveSettingsDebounced(); return 'filled'; }
        } else if (key === LOCAL_KEY) {
            // moved to a remote host: the placeholder would go out as a real key
            s.apiKey = '';
            saveSettingsDebounced();
            return 'cleared';
        }
        return null;
    } catch (e) { return null; }
}

function renderConn() {
    const box = document.getElementById('rsh-conn-list');
    if (!box) return;
    const rows = connRows();
    const own = rows.filter(r => r.own);
    box.innerHTML = rows.length ? rows.map(r => `
        <div class="rsh-cline ${r.own ? 'own' : ''}">
            <span class="rsh-cname">${esc(r.name)}</span>
            ${r.own
            ? `<span class="rsh-cval" title="${esc(r.url || t('connSharedUrl'))}">${esc(r.model)}</span>
                 <button class="rsh-mini" data-conn="${esc(r.key)}">${t('connUseShared')}</button>`
            : `<span class="rsh-cval shared">${t('connShared')}</span>`}
        </div>`).join('') : `<div class="rsh-note">${t('connNone')}</div>`;

    const sum = document.getElementById('rsh-conn-sum');
    if (sum) sum.textContent = rows.length
        ? t('connSummary', { shared: rows.length - own.length, own: own.length })
        : '';

    box.querySelectorAll('[data-conn]').forEach(b =>
        b.addEventListener('click', () => useSharedFor(b.dataset.conn)));

    const local = isLocalUrl(shared().baseUrl);
    const warn = document.getElementById('rsh-conn-local');
    if (warn) warn.style.display = local ? '' : 'none';
    // the placeholder is the cheapest place to say "you may leave this empty"
    const keyInput = document.getElementById('rsh-conn-key');
    if (keyInput) keyInput.placeholder = local ? t('connKeyLocal') : 'sk-...';
}

function bindConn() {
    normalizeShared();          // a profile saved before this fix is repaired on open
    const s = shared();
    $('#rsh-conn-url').val(s.baseUrl || '').off('change').on('change', function () {
        const url = String($(this).val()).trim();
        shared().baseUrl = url;
        /* Local servers ignore the key, but the OpenAI-shaped clients in the suite send
           an Authorization header regardless and some refuse to build one from an empty
           string. Rather than leave that as a chore to be done by hand in every panel,
           a neutral placeholder is written once — and said out loud, because a field
           filling itself in is otherwise alarming. */
        if (normalizeShared() === 'filled') {
            $('#rsh-conn-key').val(LOCAL_KEY);
            toastr.info(t('connLocalFilled'));
        }
        saveSettingsDebounced();
        renderConn();
    });
    $('#rsh-conn-key').val(s.apiKey || '').off('change').on('change', function () {
        shared().apiKey = String($(this).val()).trim();
        if (normalizeShared() === 'filled') $('#rsh-conn-key').val(LOCAL_KEY);
        saveSettingsDebounced(); renderConn();
    });
    $('#rsh-conn-model').val(s.model || '').off('change').on('change', function () {
        shared().model = String($(this).val()).trim();
        if (normalizeShared() === 'filled') $('#rsh-conn-key').val(LOCAL_KEY);
        saveSettingsDebounced(); renderConn();
    });
    renderConn();
}

/* ============================================================
   STATE PER ROW
   Everything the panel shows is derived from one of these, and every one of them
   is reached without the person pressing anything: opening the drawer is the only
   input. Buttons that ask you to go and find out are buttons that should have been
   a loading spinner.
   ============================================================ */
const ST = { CHECK: 'checking', MISS: 'missing', READY: 'ready', UPD: 'update', ZIP: 'zip', UNK: 'unknown', WORK: 'working' };
const state = {};          // url -> ST.*
let versionSupported = true;
let checked = false;       // versions have been looked at once this session

function stateOf(item) {
    if (item.preset) return null;
    if (state[item.url]) return state[item.url];
    return isInstalled(item) ? ST.CHECK : ST.MISS;
}

async function checkVersion(item) {
    // A build that cannot report versions is not the same thing as an extension that
    // has no repository behind it. Calling both "from a zip" was simply untrue, and
    // it turned one 404 into a wrong label on every row.
    if (!versionSupported) return ST.UNK;
    try {
        // git fetch can sit there for a long time on a bad connection, and a row that
        // says "checking" for ever is worse than one that admits it does not know.
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), 15000);
        const r = await fetch('/api/extensions/version', {
            method: 'POST',
            headers: getRequestHeaders(),
            signal: ac.signal,
            body: JSON.stringify({ extensionName: folderOf(item.url), global: isGlobalFor(item.url) })
        }).finally(() => clearTimeout(timer));
        if (r.status === 404) { versionSupported = false; return ST.UNK; }
        if (!r.ok) return ST.ZIP;
        const d = await r.json();
        if (typeof d?.isUpToDate !== 'boolean') return ST.UNK;
        return d.isUpToDate ? ST.READY : ST.UPD;
    } catch (e) { return versionSupported ? ST.ZIP : ST.UNK; }
}

/* Checked one at a time and painted as each answer lands, so the list fills in
   rather than freezing until all fifteen are done. */
async function checkAll(force) {
    if (checked && !force) return;
    checked = true;
    for (const item of catalog) {
        if (item.preset || !isInstalled(item)) continue;
        if (state[item.url] === ST.WORK) continue;      // the person is acting on this row
        state[item.url] = ST.CHECK; paintRow(item);
        let st;
        try { st = await checkVersion(item); } catch (e) { st = ST.ZIP; }
        if (state[item.url] === ST.CHECK) { state[item.url] = st; paintRow(item); }
        paintTotals();
    }
    paintTotals();
    if (settings.autoUpdate === 'auto') await updateAll(true);
}

/* ============================================================
   DOING THINGS
   ============================================================ */
async function doInstall(item) {
    if (state[item.url] === ST.WORK) return;
    state[item.url] = ST.WORK; paintRow(item);
    let ok = false;
    try {
        await installOne(item.url);
        ok = true;
    } catch (e) {
        console.error('[Suite Hub] install failed:', item.name, e);
        // git will not clone into a folder that already exists, and a delete that only
        // half succeeded — common on Windows, where .git objects are read-only — leaves
        // exactly that. Try once more with the leftovers removed before giving up.
        let retried = false;
        try {
            await loadFolders();
            if (entryFor(item.url)) {
                await fetch('/api/extensions/delete', {
                    method: 'POST', headers: getRequestHeaders(),
                    body: JSON.stringify({ extensionName: folderOf(item.url), global: isGlobalFor(item.url) })
                });
                installedFolders = null; await loadFolders();
                await installOne(item.url);
                ok = true; retried = true;
            }
        } catch (e2) { console.error('[Suite Hub] retry failed:', e2); }
        if (!ok) {
            const folder = folderOf(item.url);
            const why = (e && e.detail) ? e.detail : '';
            toastr.error(why
                ? t('failoneWhy', { name: item.name, why })
                : t('failoneFolder', { name: item.name, folder }), '', { timeOut: 15000 });
        } else if (retried) {
            console.log('[Suite Hub] installed after clearing leftovers:', item.name);
        }
    }
    // Whatever happened above, the row must not be left spinning: a state is decided
    // here and nowhere else. Re-reading the folders and asking for a version are both
    // allowed to fail without taking the row down with them.
    if (ok) {
        try { installedFolders = null; await loadFolders(); } catch (e) { }
        let st = ST.READY;
        try { st = await checkVersion(item); } catch (e) { st = ST.ZIP; }
        state[item.url] = (st === ST.UPD) ? ST.READY : st;   // just cloned: it IS current
        needsReload(true);
    } else {
        state[item.url] = ST.MISS;
    }
    paintRow(item); paintTotals();
}

async function doUpdate(item, silent) {
    if (state[item.url] === ST.WORK) return false;
    const before = state[item.url];
    state[item.url] = ST.WORK; paintRow(item);
    try {
        const r = await updateOne(item.url);
        state[item.url] = ST.READY;
        if (!(r && r.isUpToDate === true)) needsReload(true);
        paintRow(item);
        return true;
    } catch (e) {
        console.warn('[Suite Hub] update skipped:', item.name, '->', folderOf(item.url), e && e.message);
        state[item.url] = ST.ZIP;                // no repository behind it
        if (!silent && before === ST.UPD) toastr.warning(t('failupd', { name: item.name }));
        paintRow(item);
        return false;
    }
}

/* Deleting is the one thing here that destroys something, so it is the one thing
   that asks first. The settings of a removed extension stay in SillyTavern's own
   settings.json — that is its business, not ours, and it means reinstalling later
   brings your configuration back. */
async function doDelete(item) {
    if (state[item.url] === ST.WORK) return;
    if (!confirm(t('delAsk', { name: item.name }))) return;
    state[item.url] = ST.WORK; paintRow(item);
    try {
        const r = await fetch('/api/extensions/delete', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ extensionName: folderOf(item.url), global: isGlobalFor(item.url) })
        });
        if (r.status === 404) throw new Error('no delete endpoint');
        if (!r.ok) {
            const detail = await serverSays(r);
            console.error('[Suite Hub] delete refused:', r.status, detail, '| folder:', folderOf(item.url), '| global:', isGlobalFor(item.url));
            const err = new Error('HTTP ' + r.status + (detail ? ': ' + detail : ''));
            err.detail = detail; throw err;
        }
        installedFolders = null; await loadFolders();
        delete state[item.url];
        toastr.info(t('delDone', { name: item.name }));
        needsReload(true);
    } catch (e) {
        console.error('[Suite Hub] delete failed:', item.name, e);
        toastr.warning((e && e.detail)
            ? t('delFailWhy', { name: item.name, why: e.detail })
            : t('delFail', { name: item.name }), '', { timeOut: 15000 });
        delete state[item.url];
    }
    paintRow(item); paintTotals();
}

async function installMissing() {
    const todo = catalog.filter(x => !x.preset && stateOf(x) === ST.MISS);
    for (const item of todo) await doInstall(item);
    paintTotals();
}

async function updateAll(silent) {
    const todo = catalog.filter(x => stateOf(x) === ST.UPD);
    for (const item of todo) await doUpdate(item, silent);
    paintTotals();
}

function needsReload(on) {
    const b = document.getElementById('rsh-reload');
    if (b) b.style.display = on ? '' : 'none';
}

/* ============================================================
   PAINTING
   ============================================================ */
function rowHtml(item) {
    const st = stateOf(item);
    const d = (item.desc && (item.desc[RU() ? 'ru' : 'en'] || item.desc.en)) || '';
    return `
    <div class="rsh-row" data-url="${esc(item.url)}">
        <div class="rsh-emoji">${esc(item.emoji || '📦')}</div>
        <div class="rsh-body">
            <div class="rsh-name">${esc(item.name)}${item.core ? '<span class="rsh-tag">core</span>' : ''}</div>
            <div class="rsh-desc">${esc(d)}</div>
        </div>
        <div class="rsh-act"></div>
        <a class="rsh-page" href="${esc(item.url)}" target="_blank" rel="noopener" title="${esc(t('bOpen'))}">↗</a>
    </div>`;
}

function paintRow(item) {
    const row = document.querySelector(`.rsh-row[data-url="${CSS.escape(item.url)}"]`);
    if (!row) return;
    const act = row.querySelector('.rsh-act');
    const st = stateOf(item);
    row.className = 'rsh-row' + (st ? ' rsh-' + st : '');

    if (item.preset) {
        act.innerHTML = `<a class="rsh-btn ghost" href="${esc(item.url)}" target="_blank" rel="noopener">${t('bInstall')}</a>`;
        return;
    }
    if (st === ST.WORK || st === ST.CHECK) {
        act.innerHTML = `<span class="rsh-spin"></span><span class="rsh-lbl">${st === ST.WORK ? t('stWorking') : t('stChecking')}</span>`;
        return;
    }
    if (st === ST.MISS) {
        act.innerHTML = `<button class="rsh-btn go" data-do="install">${t('bInstall')}</button>`;
    } else if (st === ST.UPD) {
        act.innerHTML = `<button class="rsh-btn upd" data-do="update">${t('bUpdate')}</button>`;
    } else if (st === ST.ZIP) {
        act.innerHTML = `<span class="rsh-lbl zip" title="${esc(t('zipHint'))}">${t('stZip')}</span>`;
    } else if (st === ST.UNK) {
        act.innerHTML = `<span class="rsh-lbl ok">✓ ${t('stInstalled')}</span>`;
    } else {
        act.innerHTML = `<span class="rsh-lbl ok">✓ ${t('stReady')}</span>`;
    }
    // Anything actually on disk can be taken off it. Small and last, so it is never
    // the thing your eye lands on.
    if (st !== ST.MISS) {
        act.insertAdjacentHTML('beforeend',
            `<button class="rsh-x" data-do="delete" title="${esc(t('delTip'))}">✕</button>`);
    }
    act.querySelectorAll('[data-do]').forEach(b => b.addEventListener('click', () => {
        const what = b.dataset.do;
        if (what === 'install') doInstall(item);
        else if (what === 'update') doUpdate(item);
        else doDelete(item);
    }));
}

function paintTotals() {
    const real = catalog.filter(x => !x.preset);
    const miss = real.filter(x => stateOf(x) === ST.MISS).length;
    const upd = real.filter(x => stateOf(x) === ST.UPD).length;
    const have = real.length - miss;

    const c = document.getElementById('rsh-counts');
    if (c) c.textContent = t('counts', { have, all: real.length });

    const bi = document.getElementById('rsh-allinstall');
    if (bi) { bi.style.display = miss ? '' : 'none'; bi.textContent = t('allInstall', { n: miss }); }
    const bu = document.getElementById('rsh-allupdate');
    if (bu) { bu.style.display = upd ? '' : 'none'; bu.textContent = t('allUpdate', { n: upd }); }

    const ok = document.getElementById('rsh-allset');
    const settled = !miss && !upd && catalog.every(x => stateOf(x) !== ST.CHECK);
    if (ok) ok.style.display = settled ? '' : 'none';
}

function render() {
    const box = document.getElementById('rsh-list');
    if (!box) return;
    box.innerHTML = catalog.map(rowHtml).join('');
    catalog.forEach(paintRow);
    paintTotals();
}

/* ---------- the core, installed with the hub ---------- */
async function firstRun() {
    if (settings.greeted) return;
    settings.greeted = true; save();
    const core = catalog.find(x => x.core && !x.preset);
    if (!core || isInstalled(core)) return;
    state[core.url] = ST.WORK; paintRow(core);
    try {
        await installOne(core.url);
        installedFolders = null; await loadFolders();
        state[core.url] = ST.READY;
        toastr.success(t('coreDone'));
        needsReload(true);
    } catch (e) {
        console.error('[Suite Hub] core install failed:', e);
        state[core.url] = ST.MISS;
        toastr.warning(t('coreFail'));
    }
    paintRow(core); paintTotals();
}

/* ============================================================
   PANEL
   ============================================================ */
function panelHtml() {
    return `
<div class="extension_settings rsh-settings">
  <div class="inline-drawer">
    <div class="rsh-drawer inline-drawer-header" style="cursor:pointer;">
      <b>🧩 ${t('title')}</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content" style="display:none;padding-top:10px;">
      <div class="rsh-top">
        <span class="rsh-introtxt">${t('intro')}</span>
        <span id="rsh-counts" class="rsh-counts"></span>
      </div>
      <div class="rsh-conn" id="rsh-conn">
        <div class="rsh-connhead" id="rsh-conn-toggle">
          <i class="fa-solid fa-plug"></i>
          <b>${t('connTitle')}</b>
          <span id="rsh-conn-sum" class="rsh-counts"></span>
          <i class="fa-solid fa-chevron-down rsh-chev"></i>
        </div>
        <div class="rsh-connbody" id="rsh-conn-body" style="display:none;">
          <div class="rsh-note">${t('connHint')}</div>
          <div class="rsh-line"><label>${t('connUrl')}</label>
            <input type="text" id="rsh-conn-url" class="text_pole" placeholder="https://openrouter.ai/api/v1"></div>
          <div class="rsh-line"><label>${t('connKey')}</label>
            <input type="password" id="rsh-conn-key" class="text_pole" placeholder="sk-..."></div>
          <div class="rsh-line"><label>${t('connModel')}</label>
            <input type="text" id="rsh-conn-model" class="text_pole" placeholder="google/gemma-3-27b-it"></div>
          <div id="rsh-conn-local" class="rsh-note local" style="display:none;">${t('connLocal')}</div>
          <div id="rsh-conn-list" class="rsh-connlist"></div>
        </div>
      </div>
      <div id="rsh-list" class="rsh-list"></div>
      <div id="rsh-allset" class="rsh-allset" style="display:none;">✅ ${t('allset')}</div>
      <div class="rsh-actions">
        <div id="rsh-allinstall" class="menu_button rsh-primary" style="display:none;"></div>
        <div id="rsh-allupdate" class="menu_button rsh-primary" style="display:none;"></div>
        <div id="rsh-reload" class="menu_button rsh-primary" style="display:none;">${t('reload')}</div>
      </div>
      <div class="rsh-more">
        <div class="rsh-morebody">
          <div class="rsh-line"><label>${t('lang')}</label>
            <select id="rsh-lang" class="text_pole"><option value="en">English</option><option value="ru">Русский</option></select></div>
          <div class="rsh-line"><label>${t('updMode')}</label>
            <select id="rsh-updmode" class="text_pole">
              <option value="manual">${t('updManual')}</option>
              <option value="auto">${t('updAuto')}</option>
            </select></div>
          <label class="checkbox_label"><input type="checkbox" id="rsh-global"> <span>${t('globalLbl')}</span></label>
          <div class="rsh-note">${t('globalHint')}</div>
          <div class="rsh-note">${t('needgit')}</div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}

function bind() {
    $('.rsh-drawer').off('click').on('click', function () {
        const body = $(this).next();
        body.slideToggle();
        $(this).find('.inline-drawer-icon').toggleClass('down up');
        // Opening the panel IS the request to check: no button for it.
        if (body.is(':hidden')) checkAll(false);
    });
    $('#rsh-lang').val(settings.language).off('change').on('change', function () {
        settings.language = $(this).val(); save(); mount(); checkAll(true);
    });
    $('#rsh-updmode').val(settings.autoUpdate).off('change').on('change', function () {
        settings.autoUpdate = $(this).val(); save();
        if (settings.autoUpdate === 'auto') updateAll(true);
    });
    $('#rsh-global').prop('checked', !!settings.globalInstall).off('change').on('change', async function () {
        settings.globalInstall = this.checked; save();
        installedFolders = null; await loadFolders(); checkAll(true); render();
    });
    $('#rsh-conn-toggle').off('click').on('click', function () {
        const body = $('#rsh-conn-body');
        body.slideToggle(140);
        $(this).find('.rsh-chev').toggleClass('open');
    });
    bindConn();
    $('#rsh-allinstall').off('click').on('click', installMissing);
    $('#rsh-allupdate').off('click').on('click', () => updateAll(false));
    $('#rsh-reload').off('click').on('click', () => location.reload());
}

function mount() {
    $('.rsh-settings').remove();
    const holder = document.getElementById('extensions_settings') || document.getElementById('extensions_settings2');
    if (!holder) return;
    $(holder).prepend(panelHtml());
    bind();
    render();
}

window.RPG_SUITE_HUB = {
    available: true,
    catalog: () => catalog.slice(),
    missing: () => catalog.filter(x => !x.preset && stateOf(x) === ST.MISS).map(x => x.name),
    open: () => { const d = document.querySelector('.rsh-drawer'); if (d) d.click(); }
};

jQuery(async () => {
    console.log('[Suite Hub] loaded');
    loadSettings();
    // Repair a profile saved by an older build before any extension reads it.
    normalizeShared();
    // English by default, on purpose: this panel is the first thing a stranger sees,
    // and guessing wrong at the language is a worse first impression than one click.
    mount();
    await loadFolders();
    const got = await fetchCatalog();
    catalog = got.list;
    if (!got.remote) console.warn('[Suite Hub] ' + t('offline'));
    render();
    await firstRun();
    // The first check runs on its own, so the first time someone opens the panel
    // the answers are already there.
    checkAll(false);
});
