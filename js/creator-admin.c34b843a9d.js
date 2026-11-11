/* PrepNow creator pages: built by scripts/site/build.ts from scripts/site/creator/ */
(function () {
'use strict';
if (window.top !== window.self) { try { window.top.location = window.location.href; } catch (e) {} return; }
const CONFIG = {"url":"https://tceajmlpeyuadhcoxdcx.supabase.co","anonKey":"sb_publishable_NzGp4d9agSvEP9lExUsSMQ_SJN-0kr8"};
// scripts/site/creator-pay.ts
const CREATOR_PAY = { perThousandViews: 10, perVideoCap: 300, perSubscriber: 50, maxFollowers: 5000, minPayout: 100 };
const CREATOR_SUBSCRIBER_RULE = 'når de har betalt 2 gange. Køber de et helt år, tæller den første betaling';
const CREATOR_NOT_PAYMENT = 'Gratis prøveperioder og rabat i starten tæller ikke som betaling';

// scripts/site/creator/earnings.ts
const CREATOR_POT_KR = 2000;
const CREATOR_COUNT_DAYS = 14;
const PPM = 1000000;
const PLATFORMS = ['tiktok', 'instagram'];
const PLATFORM_NAME = { tiktok: 'TikTok', instagram: 'Instagram' };
const VIDEO_STATES = ['review', 'approved', 'declined', 'posted', 'counting', 'counted', 'rejected'];
const OVERREPORT_PCT = 10;
function payViews(reported, publicViews) {
    const r = Math.max(0, Math.floor(reported));
    return publicViews === null ? r : Math.min(r, Math.max(0, Math.floor(publicViews)));
}
function overReported(reported, publicViews) {
    if (reported === null || publicViews === null)
        return false;
    return reported * 100 > publicViews * (100 + OVERREPORT_PCT);
}
function countedViews(views, viewers) {
    return Math.max(0, Math.min(Math.floor(views), 2 * Math.floor(viewers)));
}
const oreForViews = (counted) => Math.floor((counted * CREATOR_PAY.perThousandViews * 100) / 1000);
function platformRow(v, p) {
    return p === 'tiktok'
        ? { platform: p, url: v.tiktok_url, views: v.tiktok_views, viewers: v.tiktok_viewers, publicViews: v.tiktok_public_views }
        : { platform: p, url: v.instagram_url, views: v.instagram_views, viewers: v.instagram_viewers, publicViews: v.instagram_public_views };
}
function videoPay(v) {
    const platforms = PLATFORMS.map((p) => platformRow(v, p))
        .filter((p) => p.url !== null || p.views !== null)
        .map((p) => {
        const has = p.views !== null && p.viewers !== null;
        const basis = has ? payViews(p.views ?? 0, p.publicViews) : null;
        return { ...p, basis, flagged: overReported(p.views, p.publicViews), counted: has ? countedViews(basis ?? 0, p.viewers ?? 0) : 0 };
    });
    const hasNumbers = platforms.some((p) => p.basis !== null);
    const state = v.state === 'rejected' || v.state === 'declined' ? 'rejected' : v.state === 'counted' && hasNumbers ? 'counted' : 'waiting';
    const views = platforms.reduce((a, p) => a + (p.basis ?? 0), 0);
    const reported = platforms.reduce((a, p) => a + (p.views ?? 0), 0);
    const counted = platforms.reduce((a, p) => a + p.counted, 0);
    const uncapped = state === 'counted' ? oreForViews(counted) : 0;
    const cap = CREATOR_PAY.perVideoCap * 100;
    return { state, platforms, views, reported, counted, ore: Math.min(uncapped, cap), capped: uncapped > cap, countOn: v.posted_on ? countDate(v.posted_on) : null };
}
function addDays(day, days) {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
const countDate = (postedOn) => addDays(postedOn, CREATOR_COUNT_DAYS);
const payMonth = (postedOn) => countDate(postedOn).slice(0, 7);
const cphDay = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit' });
const copenhagenDay = (ms) => cphDay.format(new Date(ms)).slice(0, 10);
const copenhagenMonth = (ms) => copenhagenDay(ms).slice(0, 7);
function viewScalePpm(subsOre, viewsOre, potOre = CREATOR_POT_KR * 100) {
    const rest = Math.max(0, potOre - subsOre);
    if (viewsOre <= rest)
        return PPM;
    return Math.floor((rest * PPM) / viewsOre);
}
const scaleOre = (ore, ppm) => Math.floor((ore * ppm) / PPM);
function monthStatement(inputs, potOre = CREATOR_POT_KR * 100) {
    const priced = inputs.map((c) => ({
        id: c.id,
        videos: c.videos.map((v) => ({ id: v.id, ore: videoPay(v).ore })).filter((v) => v.ore > 0),
        subsOre: Math.max(0, Math.floor(c.subscribers)) * CREATOR_PAY.perSubscriber * 100,
    }));
    const viewsOreTotal = priced.reduce((a, c) => a + c.videos.reduce((b, v) => b + v.ore, 0), 0);
    const subsOreTotal = priced.reduce((a, c) => a + c.subsOre, 0);
    const ppm = viewScalePpm(subsOreTotal, viewsOreTotal, potOre);
    const lines = priced.map((c) => {
        const videos = c.videos.map((v) => ({ ...v, paidOre: scaleOre(v.ore, ppm) }));
        const viewsOre = videos.reduce((a, v) => a + v.paidOre, 0);
        return { id: c.id, videos, viewsOre, subsOre: c.subsOre, amountOre: viewsOre + c.subsOre };
    });
    return { ppm, potOre, viewsOreTotal, subsOreTotal, lines };
}
const payoutStatus = (x, paidAt) => (x === 'pending' || x === 'paid' || x === 'rolled' ? x : paidAt ? 'paid' : 'pending');
function settlePayout(x, minOre = CREATOR_PAY.minPayout * 100) {
    const carriedOre = x.last?.status === 'rolled' ? Math.max(0, x.last.dueOre) : 0;
    const amountOre = Math.max(0, x.amountOre);
    const dueOre = amountOre + carriedOre;
    if (dueOre <= 0)
        return { carriedOre, dueOre, status: null };
    if (x.ended || dueOre >= minOre)
        return { carriedOre, dueOre, status: 'pending' };
    return { carriedOre, dueOre, status: amountOre > 0 ? 'rolled' : null };
}
function payoutChain(rows) {
    const out = new Map();
    let waiting = [];
    for (const r of [...rows].sort((a, b) => a.month.localeCompare(b.month))) {
        const status = r.status ?? payoutStatus(undefined, r.paid_at);
        if (status === 'rolled') {
            waiting.push(r.month);
            continue;
        }
        const paidAt = status === 'paid' ? r.paid_at : null;
        out.set(r.month, { paidAt, rolled: false, paidWith: r.month });
        for (const m of waiting)
            out.set(m, { paidAt, rolled: true, paidWith: r.month });
        waiting = [];
    }
    for (const m of waiting)
        out.set(m, { paidAt: null, rolled: true, paidWith: null });
    return out;
}
const isObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const str = (x) => (typeof x === 'string' ? x : null);
const int = (x) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};
const num = (x) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
    return Number.isFinite(n) ? n : 0;
};
const intOrNull = (x) => (x === null || x === undefined ? null : int(x));
const SMALL_COUNT = 3;
const shownCount = (x) => {
    const n = intOrNull(x);
    return n === null || n < SMALL_COUNT ? null : n;
};
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
function parseVideoRow(v) {
    const posted = str(v.posted_on);
    const day = posted && DAY.test(posted.slice(0, 10)) ? posted.slice(0, 10) : null;
    const known = VIDEO_STATES.find((x) => x === v.state);
    const hasNumbers = (v.tiktok_views !== null && v.tiktok_views !== undefined) || (v.instagram_views !== null && v.instagram_views !== undefined);
    const state = known ?? (v.rejected === true ? 'rejected' : hasNumbers ? 'counted' : 'posted');
    const up = state !== 'review' && state !== 'approved' && state !== 'declined';
    if (up && !day)
        return null;
    const month = str(v.month);
    return {
        id: str(v.id) ?? day ?? '',
        title: str(v.title),
        state,
        posted_on: day,
        month: month && MONTH.test(month) ? month : day ? payMonth(day) : null,
        tiktok_url: str(v.tiktok_url),
        tiktok_views: intOrNull(v.tiktok_views),
        tiktok_viewers: intOrNull(v.tiktok_viewers),
        tiktok_public_views: intOrNull(v.tiktok_public_views),
        instagram_url: str(v.instagram_url),
        instagram_views: intOrNull(v.instagram_views),
        instagram_viewers: intOrNull(v.instagram_viewers),
        instagram_public_views: intOrNull(v.instagram_public_views),
        rejected: state === 'rejected',
        note: str(v.note),
        draft_note: str(v.draft_note),
        created_at: str(v.created_at),
        decided_at: str(v.decided_at),
        stats_sent_at: str(v.stats_sent_at),
        counted_at: str(v.counted_at),
        closed_at: str(v.closed_at),
    };
}
function parseDashboard(data) {
    if (!isObj(data) || !isObj(data.creator))
        return null;
    const c = data.creator;
    const status = c.status === 'paused' || c.status === 'ended' ? c.status : 'active';
    const s = isObj(data.subscribers) ? data.subscribers : null;
    const byMonth = {};
    if (s && isObj(s.kept_by_month))
        for (const [m, n] of Object.entries(s.kept_by_month))
            if (MONTH.test(m))
                byMonth[m] = int(n);
    const videos = (Array.isArray(data.videos) ? data.videos : []).filter(isObj).flatMap((v) => {
        const row = parseVideoRow(v);
        return row ? [row] : [];
    });
    const payouts = (Array.isArray(data.payouts) ? data.payouts : []).filter(isObj).flatMap((p) => {
        const month = str(p.month);
        if (!month || !MONTH.test(month))
            return [];
        const scale = num(p.view_scale);
        const paidAt = str(p.paid_at);
        return [{ month, views_kr: num(p.views_kr), subs_kr: num(p.subs_kr), amount_kr: num(p.amount_kr), view_scale: scale > 0 && scale <= 1 ? scale : scale > 1 ? 1 : 0, paid_at: paidAt, status: payoutStatus(p.status, paidAt), carried_kr: num(p.carried_kr) }];
    });
    return {
        creator: { name: str(c.name) ?? '', code: str(c.code), tiktok: str(c.tiktok), instagram: str(c.instagram), status, since: str(c.since) ?? '' },
        code_uses: int(data.code_uses),
        code_uses_month: int(data.code_uses_month),
        subscribers: s ? { trials: shownCount(s.trials), paying: shownCount(s.paying), kept: int(s.kept), pending: shownCount(s.pending), lost: shownCount(s.lost), kept_by_month: byMonth, updated_at: str(s.updated_at) ?? '' } : null,
        videos,
        payouts,
        now: str(data.now) ?? '',
        folder: str(data.folder),
        admin: data.admin === true,
    };
}
const toOre = (kr) => Math.round(kr * 100);
const activityDay = (r) => r.posted_on ?? (r.created_at ? copenhagenDay(Date.parse(r.created_at)) : '');
function summarize(d, now) {
    const month = copenhagenMonth(now);
    const kept = d.subscribers?.kept_by_month ?? {};
    const payouts = new Map(d.payouts.map((p) => [p.month, p]));
    const chain = payoutChain(d.payouts);
    const pays = d.videos.map((row) => ({ row, pay: videoPay(row) }));
    const monthsSet = new Set([...pays.flatMap((v) => (v.row.month ? [v.row.month] : [])), ...Object.keys(kept), ...payouts.keys()]);
    const months = [...monthsSet].sort().reverse().map((m) => {
        const inMonth = pays.filter((v) => v.row.month === m && v.pay.state === 'counted');
        const p = payouts.get(m);
        if (p) {
            const viewsOre = toOre(p.views_kr);
            const subsOre = toOre(p.subs_kr);
            const link = chain.get(m);
            return { month: m, viewsOre, subsOre, amountOre: viewsOre + subsOre, settled: true, paidAt: link?.paidAt ?? null, rolled: link?.rolled ?? false, paidWith: link?.paidWith ?? null, carriedOre: toOre(p.carried_kr ?? 0), ppm: Math.round(p.view_scale * PPM), videos: inMonth.length, subscribers: Math.round(subsOre / (CREATOR_PAY.perSubscriber * 100)) };
        }
        const viewsOre = inMonth.reduce((a, v) => a + v.pay.ore, 0);
        const subscribers = kept[m] ?? 0;
        const subsOre = subscribers * CREATOR_PAY.perSubscriber * 100;
        return { month: m, viewsOre, subsOre, amountOre: viewsOre + subsOre, settled: false, paidAt: null, rolled: false, paidWith: null, carriedOre: 0, ppm: PPM, videos: inMonth.length, subscribers };
    });
    const byMonth = new Map(months.map((m) => [m.month, m]));
    const videos = pays
        .map(({ row, pay }) => {
        const m = row.month ? byMonth.get(row.month) : undefined;
        const ppm = m?.settled ? m.ppm : PPM;
        return { ...pay, row, paidOre: scaleOre(pay.ore, ppm), scaled: ppm < PPM && pay.ore > 0 };
    })
        .sort((a, b) => activityDay(b.row).localeCompare(activityDay(a.row)) || a.row.id.localeCompare(b.row.id));
    const earnedOre = months.reduce((a, m) => a + m.amountOre, 0);
    const paidOre = months.reduce((a, m) => a + (m.paidAt ? m.amountOre : 0), 0);
    const empty = { month, viewsOre: 0, subsOre: 0, amountOre: 0, settled: false, paidAt: null, rolled: false, paidWith: null, carriedOre: 0, ppm: PPM, videos: 0, subscribers: 0 };
    const s = d.subscribers;
    return {
        month,
        thisMonth: byMonth.get(month) ?? empty,
        months,
        earnedOre,
        paidOre,
        outstandingOre: Math.max(0, earnedOre - paidOre),
        videos,
        funnel: {
            uses: d.code_uses,
            usesThisMonth: d.code_uses_month,
            trials: s ? shownCount(s.trials) : null,
            paying: s ? shownCount(s.paying) : null,
            kept: s?.kept ?? 0,
            pending: s ? shownCount(s.pending) : null,
            lost: s ? shownCount(s.lost) : null,
            updatedAt: s?.updated_at || null,
        },
    };
}
const MONTHS = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
const MONTHS_SHORT = ['jan.', 'feb.', 'mar.', 'apr.', 'maj', 'jun.', 'jul.', 'aug.', 'sep.', 'okt.', 'nov.', 'dec.'];
const formatInt = (n) => new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(n);
function formatKr(ore) {
    const whole = ore % 100 === 0;
    return new Intl.NumberFormat('da-DK', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(ore / 100) + ' kr';
}
function monthName(month, currentMonth) {
    const [y, m] = month.split('-').map(Number);
    const name = MONTHS[m - 1] ?? month;
    return currentMonth && currentMonth.slice(0, 4) === String(y) ? name : `${name} ${y}`;
}
function shortDate(day, currentMonth) {
    const [y, m, d] = day.slice(0, 10).split('-').map(Number);
    const text = `${d}. ${MONTHS_SHORT[m - 1] ?? ''}`;
    return currentMonth && currentMonth.slice(0, 4) !== String(y) ? `${text} ${y}` : text;
}
const formatPercent = (ppm) => `${new Intl.NumberFormat('da-DK', { maximumFractionDigits: 0 }).format(Math.floor(ppm / 10000))} %`;

// scripts/site/creator/client.ts
const LOGIN_PATH = '/creator/login/';
const KONTO_PATH = '/creator/konto/';
const ADMIN_PATH = '/creator/admin/';
function demoAllowed(hostname) {
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}
function demoMode(search, hostname) {
    const v = new URLSearchParams(search).get('demo');
    return v !== null && demoAllowed(hostname) ? v : null;
}
function portalClient() {
    if (!CONFIG || typeof supabase === 'undefined')
        return null;
    return supabase.createClient(CONFIG.url, CONFIG.anonKey, { auth: { flowType: 'implicit', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
}
async function uploadFile(client, bucket, path, file, contentType, onProgress) {
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;
    if (!CONFIG || !token)
        return { ok: false, status: 401, body: 'not signed in' };
    const cfg = CONFIG;
    return new Promise((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${cfg.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`);
        xhr.setRequestHeader('authorization', `Bearer ${token}`);
        xhr.setRequestHeader('apikey', cfg.anonKey);
        xhr.setRequestHeader('content-type', contentType);
        xhr.setRequestHeader('x-upsert', 'false');
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable && e.total > 0)
                onProgress(e.loaded / e.total);
        };
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, status: xhr.status, body: String(xhr.responseText).slice(0, 500) });
        xhr.onerror = () => resolve({ ok: false, status: 0, body: 'network' });
        xhr.send(file);
    });
}
function freshId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
        return crypto.randomUUID();
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const x = [...b].map((n) => n.toString(16).padStart(2, '0')).join('');
    return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}
function linkError(hash, search) {
    for (const part of [hash.replace(/^#/, ''), search.replace(/^\?/, '')]) {
        const p = new URLSearchParams(part);
        const code = p.get('error_code') ?? '';
        const error = p.get('error') ?? '';
        if (!code && !error)
            continue;
        const text = `${code} ${error} ${p.get('error_description') ?? ''}`.toLowerCase();
        return /expired|invalid|access_denied|otp/.test(text) ? 'expired' : 'failed';
    }
    return null;
}
function looksLikeEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 320;
}
function otpErrorKind(e) {
    if (!e)
        return 'failed';
    const text = `${e.code ?? ''} ${e.message ?? ''}`.toLowerCase();
    if (e.status === 429 || /rate|security purposes|too many|after \d+ seconds/.test(text))
        return 'wait';
    if (/signups? not allowed|otp_disabled|user not found|not found/.test(text))
        return 'unknown';
    if (/fetch|network|load failed|timed? ?out/.test(text) || e.status === 0)
        return 'offline';
    return 'failed';
}
function waitSeconds(message) {
    const m = /(\d+)\s*seconds?/.exec(message ?? '');
    const s = m ? Number(m[1]) : 60;
    return Math.min(Math.max(s, 5), 600);
}
function byId(id) {
    const el = document.getElementById(id);
    if (!el)
        throw new Error(`#${id} is missing`);
    return el;
}
function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs))
        if (v !== undefined)
            el.setAttribute(k, v);
    for (const c of children)
        if (c !== null && c !== undefined && c !== false)
            el.append(typeof c === 'string' ? document.createTextNode(c) : c);
    return el;
}
function safeVideoUrl(url) {
    if (!url)
        return null;
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && /(^|\.)(tiktok\.com|instagram\.com)$/.test(u.hostname) ? u.href : null;
    }
    catch {
        return null;
    }
}

// scripts/site/creator/workflow.ts
const UPLOAD_BUCKET = 'creator-uploads';
const UPLOAD_MAX_MB = 50;
const UPLOAD_TYPES = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/mp4' };
const MAX_WAITING = 5;
const DRAFT_KEEP_DAYS = 30;
const POST_DEADLINE_DAYS = 30;
const NOTE_MAX = 300;
const TITLE_MAX = 120;
const TRANSITIONS = {
    submit: { from: [], to: 'review', by: 'creator' },
    approve: { from: ['review'], to: 'approved', by: 'admin' },
    decline: { from: ['review'], to: 'declined', by: 'admin' },
    post: { from: ['approved', 'posted'], to: 'posted', by: 'creator' },
    stats: { from: ['posted', 'counting'], to: 'counting', by: 'creator' },
    count: { from: ['counting'], to: 'counted', by: 'admin' },
    reject: { from: ['posted', 'counting', 'counted'], to: 'rejected', by: 'admin' },
};
function canDo(action, state) {
    const t = TRANSITIONS[action];
    return state === null ? t.from.length === 0 : t.from.includes(state);
}
const statsOpenOn = (r) => (r.posted_on ? countDate(r.posted_on) : null);
function statsReady(r, today) {
    const open = statsOpenOn(r);
    return r.state === 'posted' && !!r.decided_at && canDo('stats', r.state) && open !== null && open <= today;
}
const endingOf = (name) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? '').toLowerCase();
function uploadType(file) {
    const byEnding = UPLOAD_TYPES[endingOf(file.name)];
    if (byEnding)
        return byEnding;
    return Object.values(UPLOAD_TYPES).includes(file.type) ? file.type : null;
}
function uploadProblem(file, what = 'video') {
    if (!uploadType(file)) {
        return file.type.startsWith('image/')
            ? 'Det er et billede. Vi skal bruge en skærmoptagelse (en video), hvor du viser tallene.'
            : `Det er ikke en video, vi kan bruge. Vælg en ${what === 'video' ? 'video' : 'optagelse'} i mp4 eller mov.`;
    }
    if (file.size <= 0)
        return 'Filen er tom. Prøv at vælge den igen.';
    if (file.size > UPLOAD_MAX_MB * 1024 * 1024) {
        const size = formatMb(file.size) === `${UPLOAD_MAX_MB} MB` ? `lidt over ${UPLOAD_MAX_MB} MB` : formatMb(file.size);
        return `Filen er på ${size}, og vi tager højst ${UPLOAD_MAX_MB}\u00a0MB. ${tooBigTip(what)}`;
    }
    return null;
}
const tooBigTip = (what) => what === 'video' ? 'Gem eller eksportér videoen i 1080p (ikke 4K), og prøv igen.' : 'Lav en kortere optagelse, hvor du kun viser tallene, og prøv igen.';
function formatMb(bytes) {
    const mb = bytes / (1024 * 1024);
    return `${new Intl.NumberFormat('da-DK', { maximumFractionDigits: mb < 10 ? 1 : 0 }).format(mb)} MB`;
}
function uploadPath(folder, id, contentType) {
    return `${folder}/${id}.${contentType === 'video/quicktime' ? 'mov' : 'mp4'}`;
}
const TIKTOK_LINK = /^https?:\/\/(?:www\.|m\.)?tiktok\.com\/(@[A-Za-z0-9._]{1,40})\/(video|photo)\/([0-9]{1,25})(?:[/?#].*)?$/i;
const INSTAGRAM_LINK = /^https?:\/\/(?:www\.)?instagram\.com\/(?:[A-Za-z0-9._]{1,30}\/)?(reels?|p|tv)\/([A-Za-z0-9_-]{1,40})(?:[/?#].*)?$/i;
const SHORT_LINK = /^(?:https?:\/\/)?(?:(?:vm|vt)\.tiktok\.com|(?:www\.)?instagr\.am)(?:[/?#]|$)/i;
const isShortLink = (typed) => SHORT_LINK.test(typed.trim());
const SHORT_LINK_TEXT = 'Det er et kort delelink. Åbn det i din browser, og kopiér det lange link fra adressefeltet (det med /video/ eller /reel/).';
function videoLink(typed, platform) {
    const t = typed.trim();
    if (!t || isShortLink(t))
        return null;
    const full = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    if (platform === 'tiktok') {
        const m = TIKTOK_LINK.exec(full);
        return m ? `https://www.tiktok.com/${m[1].toLowerCase()}/${m[2].toLowerCase()}/${m[3]}` : null;
    }
    const m = INSTAGRAM_LINK.exec(full);
    if (!m)
        return null;
    const kind = m[1].toLowerCase();
    return `https://www.instagram.com/${kind === 'reels' ? 'reel' : kind}/${m[2]}/`;
}
function videoKey(link, platform) {
    if (!link)
        return null;
    const m = platform === 'tiktok'
        ? /^https:\/\/[^/]*tiktok\.com\/@[^/]+\/(?:video|photo)\/([0-9]{1,25})/i.exec(link)
        : /^https:\/\/[^/]*instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{1,40})/i.exec(link);
    return m ? m[1] : null;
}
function typedCount(typed) {
    const s = typed.replace(/[.\s_]/g, '');
    if (!/^\d{1,10}$/.test(s))
        return null;
    const n = Number(s);
    return n <= 2000000000 ? n : null;
}
function refusalText(message) {
    const code = /creator:([a-z_]+)/.exec(message ?? '')?.[1] ?? '';
    const texts = {
        wrong_state: 'Videoen er flyttet videre i mellemtiden. Opdatér siden, og prøv igen.',
        not_yours: 'Den video hører ikke til din konto.',
        not_admin: 'Kun admin kan gøre det.',
        not_active: 'Din creator-konto er sat på pause, så du kan ikke sende nye videoer lige nu.',
        too_many: `Du har ${MAX_WAITING} videoer, der venter på ok. Vent på svar på dem først.`,
        no_upload: 'Vi kunne ikke finde filen. Prøv at uploade den igen.',
        bad_link: 'Linket virker ikke. Kopiér det fra appen med "Del" → "Kopiér link".',
        short_link: SHORT_LINK_TEXT,
        too_late: `Vi sagde ok for mere end ${POST_DEADLINE_DAYS} dage siden. Send videoen til os igen, så kigger vi på den.`,
        too_many_uploads: 'Du har uploadet mange filer i dag. Prøv igen i morgen.',
        stats_changed: 'Creatoren har sendt nye tal – genindlæs',
        duplicate_link: 'Det link er allerede brugt til en anden video.',
        need_link: 'Tilføj mindst ét link: TikTok eller Instagram.',
        bad_date: 'Datoen passer ikke. Den skal være efter vores ok og senest i dag.',
        too_early: 'Statistikken kan først sendes 14 dage efter, at videoen er lagt op.',
        need_numbers: 'Skriv tallene for hver platform, videoen ligger på.',
        need_public: 'Skriv de offentlige visninger for hver platform.',
        need_reason: 'Skriv en grund. Creatoren ser den.',
        month_closed: 'Måneden er allerede udbetalt, så videoen kan ikke ændres.',
        too_long: `Teksten er for lang. Højst ${NOTE_MAX} tegn (titlen ${TITLE_MAX}).`,
        bad_kind: 'Vælg, om du er privatperson eller har en virksomhed med CVR.',
        need_details: 'Skriv navn, adresse og by.',
        bad_postcode: 'Postnummeret er 4 cifre.',
        need_tax_id: 'Skriv dit CPR-nummer (eller CVR-nummer, hvis du har en virksomhed).',
        bad_cpr: 'CPR-nummeret er 10 cifre og starter med din fødselsdato, fx 010203-1234.',
        bad_cvr: 'Det CVR-nummer findes ikke. Tjek det på virk.dk.',
        bad_reg: 'Reg.nr. er 4 cifre.',
        need_account: 'Skriv kontonummeret til det nye reg.nr.',
        bad_account: 'Kontonummeret er 4 til 10 cifre.',
        no_key: 'Vi kan ikke gemme oplysningerne lige nu. Prøv igen senere, eller skriv til os.',
        no_details: 'Creatoren har ikke skrevet sine udbetalingsoplysninger endnu.',
        need_invoice: 'Markér først, at fakturaen er modtaget.',
        not_paid: 'Markér først udbetalingen som betalt. Den indberettes, når pengene er sendt.',
        payout_moved: 'Udbetalingen er ændret i mellemtiden. Opdatér siden.',
    };
    return texts[code] ?? 'Noget gik galt. Prøv igen om lidt.';
}
function uploadErrorText(status, body) {
    const text = body.toLowerCase();
    if (status === 0)
        return 'Vi mistede forbindelsen under uploaden. Tjek dit internet, og prøv igen.';
    if (status === 413 || /too large|exceeded the maximum|payload too large/.test(text))
        return `Filen er for stor: vi tager højst ${UPLOAD_MAX_MB}\u00a0MB. Gem eller eksportér den i 1080p, og prøv igen.`;
    if (/mime|content type|invalid_mime/.test(text))
        return 'Det er ikke en video, vi kan bruge. Vælg en video i mp4 eller mov.';
    if (status === 401)
        return 'Du er blevet logget ud. Log ind igen, og prøv igen.';
    if (status === 403 || /row-level security|unauthorized/.test(text))
        return 'Du kan ikke uploade lige nu. Har du uploadet mange filer i dag, så prøv igen i morgen.';
    return 'Uploaden gik ikke igennem. Prøv igen om lidt.';
}
const dayOf = (iso) => (iso ? iso.slice(0, 10) : null);
function creatorStatus(r, today, month, countedViews = 0) {
    const sent = dayOf(r.created_at);
    switch (r.state) {
        case 'review':
            return { label: 'Venter på ok', kind: 'wait', detail: sent ? `Du får svar her på siden. Sendt ${shortDate(sent, month)}` : 'Du får svar her på siden.', action: null };
        case 'approved': {
            const last = postDeadline(r);
            if (last && last < today)
                return { label: 'Fristen er gået', kind: 'no', detail: `Vi sagde ok for mere end ${POST_DEADLINE_DAYS} dage siden. Send videoen igen, hvis du stadig vil lægge den op.`, action: null };
            const by = last ? ` senest ${shortDate(last, month)}` : '';
            return { label: 'Godkendt – læg den op', kind: 'lime', detail: r.note ? `Fra os: ${r.note} · Læg den op${by}.` : `Læg den op${by}, og sæt linket ind her.`, action: 'post' };
        }
        case 'declined':
            return { label: 'Afvist', kind: 'no', detail: r.note ? `Grund: ${r.note}` : 'Skriv til os, hvis du vil vide hvorfor.', action: null };
        case 'posted': {
            const open = statsOpenOn(r);
            if (!r.decided_at)
                return { label: open && open > today ? `Tælles ${shortDate(open, month)}` : 'Lagt op', kind: 'muted', detail: 'Vi henter tallene selv.', action: null };
            if (open && open <= today)
                return { label: 'Klar til statistik', kind: 'violet', detail: 'Optag skærmen, mens du viser statistikken for videoen.', action: 'stats' };
            return { label: open ? `Tælles ${shortDate(open, month)}` : 'Lagt op', kind: 'muted', detail: open ? `Du kan sende statistik fra ${shortDate(open, month)}` : null, action: null };
        }
        case 'counting': {
            const at = r.stats_sent_at && Number.isFinite(Date.parse(r.stats_sent_at)) ? copenhagenDay(Date.parse(r.stats_sent_at)) : null;
            return { label: 'Vi tjekker dine tal', kind: 'wait', detail: at ? `Statistik sendt ${shortDate(at, month)}` : null, action: null };
        }
        case 'counted':
            return { label: `Talt: ${formatInt(countedViews)} visninger`, kind: 'lime', detail: null, action: null };
        case 'rejected':
            return { label: 'Ikke betalt', kind: 'no', detail: r.note, action: null };
    }
}
const VIEWERS_WORD = { tiktok: 'Seere', instagram: 'Konti nået' };
const perPlatform = (parts) => parts.map((p) => `${PLATFORM_NAME[p.platform]}: ${formatInt(p.n)}`).join(' · ');
function postedRange(r, today) {
    const ok = r.decided_at && Number.isFinite(Date.parse(r.decided_at)) ? copenhagenDay(Date.parse(r.decided_at)) : today;
    return { min: ok > today ? today : ok, max: today };
}
function postDeadline(r) {
    const at = r.decided_at ? Date.parse(r.decided_at) : NaN;
    return Number.isFinite(at) ? copenhagenDay(at + POST_DEADLINE_DAYS * 86400000) : null;
}
const dayAt = (iso) => (iso && Number.isFinite(Date.parse(iso)) ? copenhagenDay(Date.parse(iso)) : null);
function draftGoneOn(r) {
    if (r.state === 'declined' || r.state === 'counted' || r.state === 'rejected') {
        const end = dayAt(r.closed_at ?? (r.state === 'declined' ? r.decided_at : null));
        return end ? addDays(end, DRAFT_KEEP_DAYS) : null;
    }
    if (r.state === 'approved') {
        const last = postDeadline(r);
        return last ? addDays(last, DRAFT_KEEP_DAYS) : null;
    }
    return null;
}

// scripts/site/creator/payee.ts
const KIND_TEXT = {
    person: { label: 'Privatperson', tax: 'CPR-nummer', name: 'Fulde navn' },
    company: { label: 'Virksomhed (CVR)', tax: 'CVR-nummer', name: 'Virksomhedens navn' },
};
const digitsOf = (typed) => typed.replace(/[\s-]/g, '');
function cprDate(typed) {
    const s = digitsOf(typed);
    if (!/^\d{10}$/.test(s))
        return null;
    const d = Number(s.slice(0, 2));
    const m = Number(s.slice(2, 4));
    const yy = Number(s.slice(4, 6));
    const c = Number(s[6]);
    const y = yy + (c <= 3 ? 1900 : c === 4 || c === 9 ? (yy <= 36 ? 2000 : 1900) : yy <= 57 ? 2000 : 1800);
    if (m < 1 || m > 12 || d < 1)
        return null;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > last)
        return null;
    return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
const cprOk = (typed) => cprDate(typed) !== null;
function cvrOk(typed) {
    const s = digitsOf(typed);
    if (!/^[1-9]\d{7}$/.test(s))
        return false;
    const w = [2, 7, 6, 5, 4, 3, 2, 1];
    return [...s].reduce((a, ch, i) => a + Number(ch) * w[i], 0) % 11 === 0;
}
const regOk = (typed) => /^\d{4}$/.test(digitsOf(typed));
const accountOk = (typed) => /^\d{4,10}$/.test(digitsOf(typed));
const postcodeOk = (typed) => /^\d{4}$/.test(typed.replace(/\s/g, ''));
const clean = (s) => s.replace(/\s+/g, ' ').trim();
function payeeProblems(f, stored) {
    const out = {};
    const name = clean(f.full_name);
    if (name.length < 2 || name.length > 100)
        out.full_name = f.kind === 'person' ? 'Skriv dit fulde navn, som det står i banken.' : 'Skriv virksomhedens navn.';
    const address = clean(f.address);
    if (address.length < 2 || address.length > 120)
        out.address = 'Skriv vej og husnummer.';
    if (!postcodeOk(f.postcode))
        out.postcode = 'Postnummeret er 4 cifre.';
    const city = clean(f.city);
    if (!city || city.length > 60)
        out.city = 'Skriv byen.';
    const tax = digitsOf(f.tax_id);
    const keepTax = !tax && stored !== null && stored.kind === f.kind;
    if (!tax && !keepTax)
        out.tax_id = f.kind === 'person' ? 'Skriv dit CPR-nummer.' : 'Skriv virksomhedens CVR-nummer.';
    else if (tax && f.kind === 'person' && !cprOk(tax))
        out.tax_id = 'CPR-nummeret er 10 cifre og starter med din fødselsdato, fx 010203-1234.';
    else if (tax && f.kind === 'company' && !cvrOk(tax))
        out.tax_id = 'Det CVR-nummer findes ikke. Det er 8 cifre: tjek det på virk.dk.';
    const reg = digitsOf(f.reg_no);
    if (!regOk(reg))
        out.reg_no = 'Reg.nr. er 4 cifre.';
    const acc = digitsOf(f.account);
    const keepAcc = !acc && stored !== null && stored.reg_no === reg;
    if (!acc && !keepAcc)
        out.account = stored ? 'Skriv kontonummeret til det nye reg.nr.' : 'Skriv dit kontonummer.';
    else if (acc && !accountOk(acc))
        out.account = 'Kontonummeret er 4 til 10 cifre.';
    return out;
}
function payeeArgs(f) {
    const opt = (s) => digitsOf(s) || null;
    return {
        payee_kind: f.kind,
        payee_name: clean(f.full_name),
        payee_address: clean(f.address),
        payee_postcode: f.postcode.replace(/\s/g, ''),
        payee_city: clean(f.city),
        payee_tax_id: opt(f.tax_id),
        payee_reg_no: digitsOf(f.reg_no),
        payee_account: opt(f.account),
    };
}
const payeeObj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const payeeText = (x) => (typeof x === 'string' ? x : '');
function parsePayee(x) {
    if (!payeeObj(x) || (x.kind !== 'person' && x.kind !== 'company'))
        return null;
    const last4 = (v) => (/^\d{4}$/.test(payeeText(v)) ? payeeText(v) : '····');
    return { kind: x.kind, full_name: payeeText(x.full_name), address: payeeText(x.address), postcode: payeeText(x.postcode), city: payeeText(x.city), tax_id_last4: last4(x.tax_id_last4), reg_no: payeeText(x.reg_no), account_last4: last4(x.account_last4), updated_at: payeeText(x.updated_at) };
}
function parsePayeeFull(x) {
    if (!payeeObj(x) || (x.kind !== 'person' && x.kind !== 'company'))
        return null;
    return { kind: x.kind, full_name: payeeText(x.full_name), address: payeeText(x.address), postcode: payeeText(x.postcode), city: payeeText(x.city), tax_id: payeeText(x.tax_id), reg_no: payeeText(x.reg_no), account: payeeText(x.account) };
}
const maskTaxId = (kind, last4) => (kind === 'person' ? `••••••-${last4}` : `••••${last4}`);
const maskAccount = (reg, last4) => `${reg} ••••${last4}`;
const formatTaxId = (kind, id) => (kind === 'person' && /^\d{10}$/.test(id) ? `${id.slice(0, 6)}-${id.slice(6)}` : id);
const payeeKeptUntil = (lastPaidDay) => `${Number(lastPaidDay.slice(0, 4)) + 5}-12-31`;
const PAYEE_IDLE_MONTHS = 12;
const TAX_LINE = {
    person: 'Pengene er B\u2011indkomst. Vi indberetter dem til Skattestyrelsen, og du betaler selv B\u2011skat og AM\u2011bidrag.',
    company: 'Har du CVR-nummer, sender du os en faktura på beløbet. Så indberetter vi ikke noget.',
};
function parsePayoutInfo(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
        return null;
    const r = raw;
    const rows = (Array.isArray(r.payouts) ? r.payouts : []).flatMap((x) => {
        if (!x || typeof x !== 'object')
            return [];
        const o = x;
        if (typeof o.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(o.month))
            return [];
        const paidAt = typeof o.paid_at === 'string' ? o.paid_at : null;
        return [{ month: o.month, status: payoutStatus(o.status, paidAt), carried_kr: Number(o.carried_kr) || 0, paid_at: paidAt }];
    });
    return { payee: parsePayee(r.payee), rows };
}
function withPayoutInfo(d, info) {
    if (!info)
        return d;
    const rows = new Map(info.rows.map((r) => [r.month, r]));
    return { ...d, payouts: d.payouts.map((p) => {
            const r = rows.get(p.month);
            return r ? { ...p, status: r.status, carried_kr: r.carried_kr, paid_at: r.paid_at } : p;
        }) };
}

// scripts/site/creator/ui.ts
const ICONS = {
    tiktok: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.6 1.5h2.1c.2 1.5 1.1 2.6 2.6 2.8v2.1c-1 0-1.9-.3-2.6-.8v4.6a3.9 3.9 0 1 1-3.9-3.9h.4v2.2h-.4a1.7 1.7 0 1 0 1.8 1.7z" fill="currentColor"/></svg>',
    instagram: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="3.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="2.7" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="11.6" cy="4.4" r=".9" fill="currentColor"/></svg>',
    out: '<svg class="kt-out" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5h6.5V10M12.2 3.8L4 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    copy: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M13 4.5A1.5 1.5 0 0 0 11.5 3h-6A2.5 2.5 0 0 0 3 5.5v6A1.5 1.5 0 0 0 4.5 13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3.2 3.2L15 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5V4.5M7.5 9L12 4.5 16.5 9" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 14.5v2.5a2.5 2.5 0 0 0 2.5 2.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    film: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="2.5" width="14" height="19" rx="3.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.2 9.2v5.6l4.6-2.8z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    alert: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 5.8v5M10 13.9v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    ok: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.6 10.3l2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    info: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9v5M10 6.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    eye: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10S4.8 4.5 10 4.5 18.2 10 18.2 10 15.2 15.5 10 15.5 1.8 10 1.8 10z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" stroke-width="1.9"/></svg>',
    lock: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="8.5" width="12" height="9" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M7 8.5V6.2a3 3 0 0 1 6 0v2.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    bank: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.5 7.5L10 3l7.5 4.5M4 8.5v6M8 8.5v6M12 8.5v6M16 8.5v6M2.5 16.8h15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    flag: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 17.5V3.5M5 4h9.2l-2 3.4 2 3.4H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    next: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11.5M11 5.5l4.5 4.5-4.5 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    back: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16 10H4.5M9 5.5L4.5 10 9 14.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    mail: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="4.5" width="15" height="11" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M3.5 6l6.5 5 6.5-5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};
function icon(svg) {
    const t = document.createElement('template');
    t.innerHTML = svg;
    return t.content.firstChild;
}
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    }
    catch {
        const ta = h('textarea', { readonly: '', 'aria-hidden': 'true', style: 'position:fixed;opacity:0' });
        ta.value = text;
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    }
}
async function copyLater(text) {
    try {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
            await navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then((t) => new Blob([t], { type: 'text/plain' })) })]);
            return true;
        }
    }
    catch {
    }
    try {
        return await copyText(await text);
    }
    catch {
        return false;
    }
}
function copyButton(value, label, cls = '', text = 'Kopiér') {
    const b = h('button', { class: `ad-copy${cls ? ` ${cls}` : ''}`, type: 'button', 'aria-label': `Kopiér ${label}`, title: `Kopiér ${label}` }, icon(ICONS.copy), h('span', {}, text));
    let reset = 0;
    b.addEventListener('click', async () => {
        const v = value();
        b.disabled = typeof v !== 'string';
        const ok = typeof v === 'string' ? await copyText(v) : await copyLater(v);
        b.disabled = false;
        window.clearTimeout(reset);
        b.classList.toggle('is-done', ok);
        b.classList.toggle('is-failed', !ok);
        b.replaceChildren(icon(ok ? ICONS.check : ICONS.alert), h('span', {}, ok ? 'Kopieret' : 'Prøv igen'));
        if (ok)
            b.dispatchEvent(new CustomEvent('copied'));
        reset = window.setTimeout(() => {
            b.classList.remove('is-done', 'is-failed');
            b.replaceChildren(icon(ICONS.copy), h('span', {}, text));
        }, ok ? 2000 : 3500);
    });
    return b;
}
const chip = (text, kind = '') => h('span', { class: 'kt-chip' + (kind ? ` kt-chip--${kind}` : '') }, text);
const sub = (text, cls = '') => h('span', { class: 'kt-sub' + (cls ? ` ${cls}` : '') }, text);
const none = (said) => [h('span', { 'aria-hidden': 'true' }, '–'), h('span', { class: 'sr-only' }, said)];
function platformBadge(platform, url) {
    const safe = safeVideoUrl(url);
    const attrs = { class: `kt-plat kt-plat--${platform}` };
    if (safe)
        Object.assign(attrs, { href: safe, target: '_blank', rel: 'noopener noreferrer', 'aria-label': `Se videoen på ${PLATFORM_NAME[platform]} (åbner i en ny fane)` });
    return h(safe ? 'a' : 'span', attrs, icon(ICONS[platform]), PLATFORM_NAME[platform], safe ? icon(ICONS.out) : null);
}
function say(region, kind, ...parts) {
    region.replaceChildren();
    if (!kind)
        return;
    region.append(h('p', { class: `pt-msg pt-msg--${kind}` }, icon(kind === 'error' ? ICONS.alert : kind === 'ok' ? ICONS.ok : ICONS.info), h('span', {}, ...parts)));
}
function sheet(dialog, onClose) {
    let busy = false;
    const close = () => {
        if (!busy)
            dialog.close();
    };
    dialog.addEventListener('cancel', (e) => {
        if (busy)
            e.preventDefault();
    });
    dialog.addEventListener('close', onClose);
    for (const b of dialog.querySelectorAll('[data-close]')) {
        b.replaceChildren(icon(ICONS.close));
        b.addEventListener('click', close);
    }
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog)
            close();
    });
    return {
        open: () => {
            dialog.showModal();
            dialog.querySelector('h2')?.focus();
        },
        close,
        setBusy: (on) => {
            busy = on;
            dialog.toggleAttribute('data-busy', on);
        },
    };
}
function filePicker(input, name, meta, msg, empty, what) {
    let file = null;
    const area = input.closest('.kt-drop');
    const show = () => {
        area?.classList.toggle('is-picked', !!file);
        name.textContent = file ? file.name : empty.name;
        meta.textContent = file ? `${formatMb(file.size)} · klar til at sende` : empty.meta;
    };
    const pick = (f) => {
        const problem = f ? uploadProblem(f, what) : null;
        file = f && !problem ? f : null;
        input.setAttribute('aria-invalid', String(!!problem));
        if (problem)
            say(msg, 'error', problem);
        else
            say(msg, null);
        show();
    };
    input.addEventListener('change', () => pick(input.files?.[0] ?? null));
    area?.addEventListener('dragover', (e) => {
        e.preventDefault();
        area.classList.add('is-over');
    });
    area?.addEventListener('dragleave', () => area.classList.remove('is-over'));
    area?.addEventListener('drop', (e) => {
        e.preventDefault();
        area.classList.remove('is-over');
        pick(e.dataTransfer?.files?.[0] ?? null);
    });
    show();
    return {
        get: () => file,
        reset: () => {
            input.value = '';
            file = null;
            input.removeAttribute('aria-invalid');
            say(msg, null);
            show();
        },
        demoPick: (f) => {
            file = new File([new Uint8Array(1)], f.name, { type: 'video/mp4' });
            area?.classList.add('is-picked');
            name.textContent = f.name;
            meta.textContent = `${formatMb(f.size)} · klar til at sende`;
        },
    };
}
function progress(bar, share, label = 'Uploader') {
    bar.hidden = share === null;
    if (share === null)
        return;
    const pct = Math.max(0, Math.min(100, Math.round(share * 100)));
    bar.querySelector('i')?.style.setProperty('--p', `${pct}%`);
    const text = bar.querySelector('span');
    if (text)
        text.textContent = pct >= 100 ? 'Gemmer …' : `${label} … ${pct} %`;
    bar.setAttribute('aria-valuenow', String(pct));
}

// scripts/site/creator/demo.ts
const prevMonth = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};
const agoIso = (now, days, hour = 10) => new Date(Date.parse(copenhagenDay(now - days * 86400000) + 'T00:00:00Z') + hour * 3600000).toISOString();
function demoData(now, variant) {
    if (variant === 'ingen')
        return null;
    const today = copenhagenDay(now);
    const month = today.slice(0, 7);
    const creator = { name: 'Maja Hansen', code: 'MAJA', tiktok: '@maja.madbudget', instagram: '@majamad', status: 'active', since: addDays(today, -62) + 'T10:00:00Z' };
    const base = { creator, folder: '7d2f3a9e-demo', admin: false, now: new Date(now).toISOString() };
    if (variant === 'admin')
        return { admin: true, now: base.now };
    if (variant === 'ny')
        return { ...base, code_uses: 0, code_uses_month: 0, subscribers: null, videos: [], payouts: [] };
    const small = variant === 'lille';
    const empty = { tiktok_url: null, tiktok_views: null, tiktok_viewers: null, tiktok_public_views: null, instagram_url: null, instagram_views: null, instagram_viewers: null, instagram_public_views: null };
    const draft = (id, state, sentAgo, title, extra = {}) => ({
        id, title, state, posted_on: null, month: null, ...empty, rejected: false, note: null, draft_note: null,
        created_at: agoIso(now, sentAgo, 9), decided_at: state === 'review' ? null : agoIso(now, Math.max(0, sentAgo - 1), 14), stats_sent_at: null,
        closed_at: state === 'declined' ? agoIso(now, Math.max(0, sentAgo - 1), 14) : null, ...extra,
    });
    const up = (id, state, daysAgo, title, tt, ig, extra = {}) => {
        const posted = addDays(today, -daysAgo);
        const numbers = state === 'counting' || state === 'counted' || state === 'rejected';
        const counted = state === 'counted';
        return {
            id,
            title,
            state,
            posted_on: posted,
            month: payMonth(posted),
            tiktok_url: tt ? `https://www.tiktok.com/@maja.madbudget/video/74${id}` : null,
            tiktok_views: tt && numbers ? tt[0] : null,
            tiktok_viewers: tt && numbers ? tt[1] : null,
            tiktok_public_views: tt && counted ? tt[0] : null,
            instagram_url: ig ? `https://www.instagram.com/reel/C${id}xYz/` : null,
            instagram_views: ig && numbers ? ig[0] : null,
            instagram_viewers: ig && numbers ? ig[1] : null,
            instagram_public_views: ig && counted ? ig[0] : null,
            rejected: state === 'rejected',
            note: null,
            draft_note: null,
            created_at: agoIso(now, daysAgo + 3, 9),
            decided_at: agoIso(now, daysAgo + 2, 14),
            stats_sent_at: numbers ? agoIso(now, Math.max(0, daysAgo - 15), 19) : null,
            counted_at: counted ? agoIso(now, Math.max(0, daysAgo - 16), 10) : null,
            closed_at: counted || state === 'rejected' ? agoIso(now, Math.max(0, daysAgo - 16), 10) : null,
            ...extra,
        };
    };
    const videos = small
        ? [up('31', 'posted', 4, 'Hele ugens aftensmad for 312 kr', [0, 0], null), draft('33', 'review', 1, 'Pasta-bowls til hele ugen')]
        : [
            draft('36', 'review', 1, 'Pasta-bowls til hele ugen', { draft_note: 'Jeg siger koden til sidst. Er det tydeligt nok?' }),
            draft('35', 'approved', 3, 'Morgenmad til 5 kr'),
            draft('34', 'declined', 6, 'Min Lidl-haul', { note: 'Du siger ikke din kode i videoen. Sig MAJA, og vis appen, så siger vi ok.' }),
            up('31', 'posted', 4, 'Hele ugens aftensmad for 312 kr', [0, 0], [0, 0]),
            up('28', 'posted', 15, 'Tre retter af én pakke kylling', [0, 0], null),
            up('25', 'counting', 17, 'Meal prep på to aftener med Netto-tilbud', [18400, 7900], [6100, 4200], { stats_sent_at: agoIso(now, 1, 20) }),
            up('19', 'counted', 26, 'SU-mad: 8 kr pr. portion', [41000, 25000], null, { tiktok_public_views: 39200 }),
            up('14', 'counted', 34, '5 retter af REMA-tilbud', null, [3400, 2900]),
            up('08', 'counted', 49, 'Min første uge med PrepNow', [9800, 5200], null),
            up('03', 'rejected', 57, 'Billig pasta tre dage i træk', [52000, 48000], null, { note: 'Vi havde ikke sagt ok til videoen, før den kom op.' }),
        ];
    const last = prevMonth(month);
    const keptByMonth = { [last]: 1, [month]: 3 };
    const settled = monthStatement([{ id: 'maja', videos: videos.filter((x) => x.month === last), subscribers: small ? 0 : keptByMonth[last] }]);
    const line = settled.lines[0];
    const payouts = line.amountOre > 0 ? [{ month: last, views_kr: line.viewsOre / 100, subs_kr: line.subsOre / 100, amount_kr: line.amountOre / 100, view_scale: settled.ppm / 1000000, paid_at: `${month}-01T09:12:00Z` }] : [];
    return {
        ...base,
        code_uses: small ? 6 : 38,
        code_uses_month: small ? 6 : 11,
        subscribers: small
            ? { trials: 4, paying: null, kept: 0, pending: null, lost: null, kept_by_month: {}, updated_at: new Date(now - 2 * 86400000).toISOString() }
            : { trials: 14, paying: 7, kept: 4, pending: 3, lost: null, kept_by_month: keptByMonth, updated_at: new Date(now - 2 * 86400000).toISOString() },
        videos,
        payouts,
    };
}
function demoPayoutInfo(now, variant, d) {
    const month = copenhagenDay(now).slice(0, 7);
    const last = prevMonth(month);
    const before = prevMonth(last);
    const noDetails = variant === 'udbetaling' || variant === 'ny' || variant === 'lille';
    const payee = noDetails ? null : { kind: 'person', full_name: 'Maja Hansen', address: 'Nørrebrogade 41, 3. th.', postcode: '8000', city: 'Aarhus C', tax_id_last4: '1111', reg_no: '1551', account_last4: '0683', updated_at: agoIso(now, 40, 15) };
    const lastRow = d.payouts.find((p) => p.month === last);
    if (!lastRow)
        return { payee, rows: [] };
    const rolled = variant === 'udbetaling';
    const earlier = { month: before, views_kr: rolled ? 64 : 146, subs_kr: 0, amount_kr: rolled ? 64 : 146, view_scale: 1, paid_at: rolled ? null : `${last}-01T09:12:00Z`, status: rolled ? 'rolled' : 'paid', carried_kr: 0 };
    Object.assign(lastRow, { paid_at: null, status: 'pending', carried_kr: rolled ? 64 : 0 });
    d.payouts = [lastRow, earlier];
    return { payee, rows: d.payouts.map((p) => ({ month: p.month, status: p.status ?? 'pending', carried_kr: p.carried_kr ?? 0, paid_at: p.paid_at })) };
}

// scripts/site/creator/admin-data.ts
const obj = (x) => typeof x === 'object' && x !== null && !Array.isArray(x);
const text = (x) => (typeof x === 'string' ? x : null);
const whole = (x) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
};
const money = (x) => {
    const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x) : NaN;
    return Number.isFinite(n) ? n : 0;
};
function parseOverview(data) {
    if (!obj(data) || !Array.isArray(data.creators) || !Array.isArray(data.videos))
        return null;
    const creators = data.creators.filter(obj).map((c) => {
        const s = obj(c.stats) ? c.stats : null;
        const byMonth = {};
        if (s && obj(s.kept_by_month))
            for (const [m, n] of Object.entries(s.kept_by_month))
                if (/^\d{4}-(0[1-9]|1[0-2])$/.test(m))
                    byMonth[m] = whole(n);
        return {
            id: text(c.id) ?? '',
            name: text(c.name) ?? '',
            email: text(c.email),
            code: text(c.code),
            tiktok: text(c.tiktok),
            instagram: text(c.instagram),
            status: c.status === 'paused' || c.status === 'ended' ? c.status : 'active',
            since: text(c.since) ?? '',
            code_uses: whole(c.code_uses),
            stats: s ? { trials: whole(s.trials), paying: whole(s.paying), kept: whole(s.kept), pending: whole(s.pending), lost: whole(s.lost), kept_by_month: byMonth, updated_at: text(s.updated_at) ?? '' } : null,
            payouts: (Array.isArray(c.payouts) ? c.payouts : []).filter(obj).flatMap((p) => {
                const month = text(p.month);
                if (!month)
                    return [];
                const scale = money(p.view_scale);
                return [{ month, views_kr: money(p.views_kr), subs_kr: money(p.subs_kr), amount_kr: money(p.amount_kr), view_scale: Math.min(1, Math.max(0, scale)), paid_at: text(p.paid_at) }];
            }),
        };
    });
    const videos = data.videos.filter(obj).flatMap((v) => {
        const row = parseVideoRow(v);
        const creator = text(v.creator_id);
        if (!row || !creator)
            return [];
        return [{ ...row, creator_id: creator, draft_path: text(v.draft_path), stats_path: text(v.stats_path), counted_at: text(v.counted_at), closed_at: text(v.closed_at) }];
    });
    const closed = (Array.isArray(data.closed_months) ? data.closed_months : []).flatMap((m) => (typeof m === 'string' ? [m] : []));
    return { now: text(data.now) ?? '', creators, videos, closed_months: closed };
}
function countPreview(v, tiktokPublic, instagramPublic) {
    return videoPay({ ...v, state: 'counted', tiktok_public_views: v.tiktok_url ? tiktokPublic : null, instagram_public_views: v.instagram_url ? instagramPublic : null });
}
function overPercent(reported, publicViews) {
    if (reported === null || publicViews === null || reported <= publicViews)
        return null;
    if (publicViews === 0)
        return Infinity;
    return Math.round(((reported - publicViews) / publicViews) * 100);
}
const by = (f, desc = false) => (a, b) => (desc ? f(b).localeCompare(f(a)) : f(a).localeCompare(f(b))) || a.id.localeCompare(b.id);
function adminView(o, now) {
    const today = copenhagenDay(now);
    const month = copenhagenMonth(now);
    const of = (s) => o.videos.filter((v) => v.state === s);
    const creators = o.creators.map((c) => {
        const mine = o.videos.filter((v) => v.creator_id === c.id);
        const d = {
            creator: { name: c.name, code: c.code, tiktok: c.tiktok, instagram: c.instagram, status: c.status, since: c.since },
            code_uses: c.code_uses,
            code_uses_month: 0,
            subscribers: c.stats ? { ...c.stats } : null,
            videos: mine,
            payouts: c.payouts,
            now: o.now,
        };
        const s = summarize(d, now);
        return { c, videos: mine.filter((v) => v.state !== 'declined').length, waiting: mine.filter((v) => v.state === 'review' || v.state === 'counting').length, earnedOre: s.earnedOre, paidOre: s.paidOre };
    });
    const inMonth = o.videos.filter((v) => v.month === month);
    const st = monthStatement(o.creators.map((c) => ({ id: c.id, videos: inMonth.filter((v) => v.creator_id === c.id && v.state === 'counted'), subscribers: c.stats?.kept_by_month[month] ?? 0 })), CREATOR_POT_KR * 100);
    return {
        today,
        month,
        review: of('review').sort(by((v) => v.created_at ?? '')),
        count: of('counting').sort(by((v) => v.stats_sent_at ?? '')),
        approved: of('approved').sort(by((v) => v.decided_at ?? '')),
        posted: of('posted').sort(by((v) => statsOpenOn(v) ?? '')),
        history: o.videos.filter((v) => v.state === 'declined' || v.state === 'rejected' || v.state === 'counted').sort(by((v) => v.counted_at ?? v.decided_at ?? v.created_at ?? '', true)),
        creators,
        pot: {
            month,
            potOre: st.potOre,
            subsOre: st.subsOreTotal,
            viewsOre: st.viewsOreTotal,
            ppm: st.ppm,
            usedOre: st.lines.reduce((a, l) => a + l.amountOre, 0),
            notCounted: inMonth.filter((v) => v.state === 'posted' || v.state === 'counting').length,
        },
        names: new Map(o.creators.map((c) => [c.id, c])),
    };
}
function parsePayouts(data) {
    if (!obj(data) || !Array.isArray(data.payouts))
        return null;
    const payouts = data.payouts.filter(obj).flatMap((p) => {
        const id = text(p.id);
        const creator = text(p.creator_id);
        const month = text(p.month);
        if (!id || !creator || !month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
            return [];
        const paidAt = text(p.paid_at);
        return [{ id, creator_id: creator, month, views_kr: money(p.views_kr), subs_kr: money(p.subs_kr), carried_kr: money(p.carried_kr), amount_kr: money(p.amount_kr), due_kr: money(p.due_kr), view_scale: Math.min(1, Math.max(0, money(p.view_scale))), status: payoutStatus(p.status, paidAt), paid_at: paidAt, reported_at: text(p.reported_at), invoice_at: text(p.invoice_at), created_at: text(p.created_at) ?? '' }];
    });
    const payees = (Array.isArray(data.payees) ? data.payees : []).filter(obj).flatMap((y) => {
        const masked = parsePayee(y);
        const creator = text(y.creator_id);
        return masked && creator ? [{ ...masked, creator_id: creator }] : [];
    });
    return { now: text(data.now) ?? '', payouts, payees };
}
function payoutStep(p, kind) {
    if (p.status === 'paid')
        return kind === 'person' && !p.reported_at ? 'report' : 'done';
    if (!kind)
        return 'details';
    if (kind === 'company' && !p.invoice_at)
        return 'invoice';
    return 'pay';
}
const prevMonthOf = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, '0')}`;
};
const STEP_ORDER = { pay: 0, invoice: 1, report: 2, details: 3, done: 4 };
function payoutView(o, d, now) {
    const month = prevMonthOf(copenhagenMonth(now));
    const names = new Map(o.creators.map((c) => [c.id, c]));
    const payees = new Map(d.payees.map((y) => [y.creator_id, y]));
    const cards = d.payouts.map((p) => {
        const payee = payees.get(p.creator_id) ?? null;
        const mine = d.payouts.filter((x) => x.creator_id === p.creator_id);
        const chain = payoutChain(mine);
        const lastPaid = mine.filter((x) => x.id !== p.id && x.paid_at).map((x) => x.paid_at ?? '').sort().at(-1) ?? null;
        return {
            p,
            c: names.get(p.creator_id),
            payee,
            step: p.status === 'rolled' ? 'done' : payoutStep(p, payee?.kind ?? null),
            dueOre: Math.round(p.due_kr * 100),
            carriedFrom: [...chain].filter(([m, l]) => l.rolled && l.paidWith === p.month && m !== p.month).map(([m]) => m).sort(),
            changedSincePaid: !!payee && !!lastPaid && p.status !== 'paid' && Date.parse(payee.updated_at) > Date.parse(lastPaid),
        };
    });
    const byMonth = (a, b) => a.p.month.localeCompare(b.p.month) || (a.c?.name ?? '').localeCompare(b.c?.name ?? '');
    const open = cards.filter((x) => x.p.status !== 'rolled' && x.step !== 'done');
    const todo = open.filter((x) => x.step !== 'details').sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step] || byMonth(a, b));
    const owed = (id) => open.filter((x) => x.step === 'details' && x.p.creator_id === id).reduce((a, x) => a + x.dueOre, 0);
    return {
        month,
        open: !d.payouts.some((p) => p.month === month),
        todo,
        rolled: cards.filter((x) => x.p.status === 'rolled' && x.p.month >= month).sort(byMonth),
        done: cards.filter((x) => x.p.status === 'paid' && x.step === 'done' && x.p.month >= month).sort(byMonth),
        missing: o.creators.filter((c) => !payees.has(c.id) && (c.status !== 'ended' || owed(c.id) > 0)).map((c) => ({ c, dueOre: owed(c.id) })).sort((a, b) => b.dueOre - a.dueOre || a.c.name.localeCompare(b.c.name)),
        toPayOre: todo.filter((x) => x.step === 'pay').reduce((a, x) => a + x.dueOre, 0),
        waitingOre: open.filter((x) => x.step === 'invoice' || x.step === 'details').reduce((a, x) => a + x.dueOre, 0),
    };
}
function withPayoutStatus(o, d) {
    if (!d)
        return o;
    const key = (creator, month) => `${creator} ${month}`;
    const rows = new Map(d.payouts.map((p) => [key(p.creator_id, p.month), p]));
    return {
        ...o,
        creators: o.creators.map((c) => ({
            ...c,
            payouts: c.payouts.map((p) => {
                const r = rows.get(key(c.id, p.month));
                return r ? { ...p, status: r.status, carried_kr: r.carried_kr, paid_at: r.paid_at } : p;
            }),
        })),
    };
}

// scripts/site/creator/admin-demo.ts
const DEMO_CLIPS = ['/video/v2-prep.mp4', '/video/v2-pack.mp4', '/video/v2-building.mp4', '/video/flyer.mp4'];
function adminDemo(now, variant) {
    const today = copenhagenDay(now);
    const at = (daysAgo, hour, min = 0) => new Date(Date.parse(addDays(today, -daysAgo) + 'T00:00:00Z') + (hour - 1) * 3600000 + min * 60000).toISOString();
    const month = today.slice(0, 7);
    const creators = [
        { id: 'c-maja', name: 'Maja Hansen', email: 'maja@eksempel.dk', code: 'MAJA', tiktok: '@maja.madbudget', instagram: '@majamad', status: 'active', since: at(62, 10), code_uses: 38, stats: { trials: 14, paying: 7, kept: 4, pending: 3, lost: 1, kept_by_month: { [month]: 3 }, updated_at: at(2, 8) }, payouts: [] },
        { id: 'c-jonas', name: 'Jonas Lind', email: 'jonas@eksempel.dk', code: 'JONAS', tiktok: '@jonas.preps', instagram: null, status: 'active', since: at(40, 10), code_uses: 12, stats: { trials: 5, paying: 2, kept: 2, pending: 0, lost: 1, kept_by_month: { [month]: 2 }, updated_at: at(2, 8) }, payouts: [] },
        { id: 'c-emil', name: 'Emil Berg', email: 'emil@eksempel.dk', code: 'EMIL', tiktok: '@emil.koger', instagram: null, status: 'active', since: at(45, 10), code_uses: 9, stats: { trials: 3, paying: 2, kept: 2, pending: 0, lost: 0, kept_by_month: {}, updated_at: at(2, 8) }, payouts: [] },
        { id: 'c-ida', name: 'Ida Holm', email: 'ida@eksempel.dk', code: 'IDA', tiktok: null, instagram: '@ida.spiser', status: 'active', since: at(35, 10), code_uses: 2, stats: null, payouts: [] },
        { id: 'c-sofie', name: 'Sofie Krogh', email: 'sofie@eksempel.dk', code: 'SOFIE', tiktok: null, instagram: '@sofies.su.mad', status: 'active', since: at(20, 10), code_uses: 3, stats: null, payouts: [] },
    ];
    let n = 0;
    const empty = { tiktok_url: null, tiktok_views: null, tiktok_viewers: null, tiktok_public_views: null, instagram_url: null, instagram_views: null, instagram_viewers: null, instagram_public_views: null };
    const video = (creator, state, title, o = {}) => {
        n++;
        return { id: `d-${n}`, creator_id: creator, title, state, posted_on: null, month: null, ...empty, rejected: state === 'rejected', note: null, draft_note: null, created_at: at(n, 9), decided_at: null, stats_sent_at: null, draft_path: `${creator}/draft-${n}.mp4`, stats_path: null, counted_at: null, closed_at: null, ...o };
    };
    const up = (creator, handle, state, title, daysAgo, tt, ig, o = {}) => {
        const posted = addDays(today, -daysAgo);
        return video(creator, state, title, {
            posted_on: posted,
            month: payMonth(posted),
            tiktok_url: tt ? `https://www.tiktok.com/${handle}/video/7431${daysAgo}02` : null,
            instagram_url: ig ? `https://www.instagram.com/reel/C${daysAgo}xYz/` : null,
            created_at: at(daysAgo + 3, 9, 12),
            decided_at: at(daysAgo + 2, 15, 40),
            ...o,
        });
    };
    const all = [
        video('c-maja', 'review', 'Pasta-bowls til hele ugen', { created_at: at(1, 9, 12), draft_note: 'Jeg siger koden til sidst. Er det tydeligt nok?' }),
        video('c-sofie', 'review', 'SU-budget: en uge for 250 kr', { created_at: at(0, 7, 48) }),
        video('c-jonas', 'approved', 'Proteinmorgenmad til hele ugen', { created_at: at(4, 9), decided_at: at(3, 11, 5) }),
        up('c-maja', '@maja.madbudget', 'posted', 'Hele ugens aftensmad for 312 kr', 4, true, true),
        up('c-jonas', '@jonas.preps', 'posted', 'Kylling tre måder på 40 minutter', 16, true, false),
        up('c-jonas', '@jonas.preps', 'counting', 'Meal prep på 45 minutter', 15, true, false, { tiktok_views: 52000, tiktok_viewers: 30100, stats_path: 'c-jonas/stats-1.mp4', stats_sent_at: at(0, 8, 30) }),
        up('c-maja', '@maja.madbudget', 'counting', 'Meal prep på to aftener med Netto-tilbud', 17, true, true, { tiktok_views: 18400, tiktok_viewers: 7900, instagram_views: 6100, instagram_viewers: 4200, stats_path: 'c-maja/stats-2.mp4', stats_sent_at: at(1, 20, 4) }),
        up('c-maja', '@maja.madbudget', 'counted', 'SU-mad: 8 kr pr. portion', 26, true, false, { tiktok_views: 41000, tiktok_viewers: 25000, tiktok_public_views: 39200, stats_path: 'c-maja/stats-3.mp4', stats_sent_at: at(11, 18), counted_at: at(10, 9, 30), closed_at: at(10, 9, 30) }),
        up('c-sofie', '@sofies.su.mad', 'counted', 'Fem retter fra ugens REMA-avis', 18, false, true, { instagram_views: 3400, instagram_viewers: 2900, instagram_public_views: 3520, stats_path: 'c-sofie/stats-4.mp4', stats_sent_at: at(3, 18), counted_at: at(2, 9, 30), closed_at: at(2, 9, 30) }),
        video('c-sofie', 'declined', 'Lidl-haul på 150 kr', { created_at: at(7, 9), decided_at: at(6, 10, 15), closed_at: at(6, 10, 15), note: 'Du siger ikke din kode i videoen. Sig SOFIE, og vis appen, så siger vi ok.' }),
        up('c-maja', '@maja.madbudget', 'rejected', 'Billig pasta tre dage i træk', 40, true, false, { tiktok_views: 52000, tiktok_viewers: 48000, note: 'Vi havde ikke sagt ok til videoen, før den kom op.', decided_at: at(41, 10), counted_at: null, closed_at: at(20, 11) }),
    ];
    const quiet = variant === 'tom';
    const videos = quiet ? all.filter((v) => v.state === 'counted' || v.state === 'declined' || v.state === 'rejected') : all;
    return { now: new Date(now).toISOString(), creators, videos, closed_months: [] };
}
const DEMO_PAYEES = {
    'c-maja': { kind: 'person', full_name: 'Maja Hansen', address: 'Nørrebrogade 41, 3. th.', postcode: '8000', city: 'Aarhus C', tax_id: '0101001111', reg_no: '1551', account: '3274510683' },
    'c-jonas': { kind: 'person', full_name: 'Jonas Lind', address: 'Vesterbro 12', postcode: '9000', city: 'Aalborg', tax_id: '0202002222', reg_no: '9570', account: '12554078' },
    'c-sofie': { kind: 'company', full_name: 'Sofies Køkken ApS', address: 'Store Torv 3', postcode: '8000', city: 'Aarhus C', tax_id: '12345674', reg_no: '5301', account: '0244518392' },
    'c-ida': { kind: 'person', full_name: 'Ida Holm', address: 'Algade 7', postcode: '4000', city: 'Roskilde', tax_id: '0303003333', reg_no: '2200', account: '6280113420' },
};
const maskedPayee = (y, updatedAt) => ({ kind: y.kind, full_name: y.full_name, address: y.address, postcode: y.postcode, city: y.city, tax_id_last4: y.tax_id.slice(-4), reg_no: y.reg_no, account_last4: y.account.slice(-4), updated_at: updatedAt });
function adminPayoutDemo(now, variant, o) {
    const today = copenhagenDay(now);
    const iso = (daysAgo, hour) => new Date(Date.parse(addDays(today, -daysAgo) + 'T00:00:00Z') + (hour - 1) * 3600000 + 12 * 60000).toISOString();
    const back = (m, n) => {
        const [y, mo] = m.split('-').map(Number);
        const t = y * 12 + (mo - 1) - n;
        return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
    };
    const last = back(today.slice(0, 7), 1);
    const before = back(today.slice(0, 7), 2);
    const done = variant === 'tom';
    const report = variant === 'indberet';
    let n = 0;
    const row = (creator, month, views, subs, o2 = {}) => {
        n++;
        const carried = o2.carried_kr ?? 0;
        return { id: `p-${n}`, creator_id: creator, month, views_kr: views, subs_kr: subs, carried_kr: carried, amount_kr: views + subs, due_kr: views + subs + carried, view_scale: 1, status: 'pending', paid_at: null, reported_at: null, invoice_at: null, created_at: iso(0, 8), ...o2 };
    };
    const paid = (daysAgo) => ({ status: 'paid', paid_at: iso(daysAgo, 9) });
    const mine = demoData(now, '')?.payouts.find((p) => p.month === last);
    const rows = [
        row('c-maja', before, 146, 0, { status: 'paid', paid_at: `${last}-01T09:12:00Z`, reported_at: `${last}-01T10:30:00Z`, created_at: iso(31, 8) }),
        row('c-jonas', before, 64, 0, { status: 'rolled', created_at: iso(31, 8) }),
        row('c-sofie', before, 120, 0, { ...paid(30), invoice_at: iso(31, 9), created_at: iso(31, 8) }),
    ];
    if (variant !== 'opgoer') {
        rows.push(row('c-maja', last, mine?.views_kr ?? 334, mine?.subs_kr ?? 50, done ? { ...paid(0), reported_at: iso(0, 10) } : report ? paid(0) : {}), row('c-jonas', last, 300, 100, { carried_kr: 64, ...(done ? { ...paid(0), reported_at: iso(0, 10) } : paid(0)) }), row('c-sofie', last, 186.5, 0, done || report ? { ...paid(0), invoice_at: iso(0, 8) } : {}), report || done ? row('c-ida', last, 212.5, 50, done ? { ...paid(0), reported_at: iso(0, 10) } : paid(0)) : row('c-ida', last, 48, 0, { status: 'rolled' }));
        if (!done)
            rows.push(row('c-emil', last, 150, 100));
    }
    for (const c of o.creators) {
        c.payouts = rows.filter((r) => r.creator_id === c.id).map((r) => ({ month: r.month, views_kr: r.views_kr, subs_kr: r.subs_kr, amount_kr: r.amount_kr, view_scale: r.view_scale, paid_at: r.paid_at }));
    }
    return {
        now: new Date(now).toISOString(),
        payouts: rows,
        payees: Object.entries(DEMO_PAYEES).map(([id, y]) => ({ ...maskedPayee(y, iso(id === 'c-sofie' ? 3 : 40, 14)), creator_id: id })),
    };
}

// scripts/site/creator/eindkomst.ts
const EINDKOMST_URL = 'https://skat.dk/tastselverhverv';
const EINDKOMST_MENU = ['Ansatte', 'Indberet til eIndkomst eller LetLøn', 'Indberette/forespørge på eIndkomst/LetLøn', 'Indberet lønoplysninger - online'];
const INCOME_TYPE = '05';
const FIELD_36 = '36';
const EINDKOMST_FIELDS = [
    { key: 'start', label: 'Lønperiode start' },
    { key: 'end', label: 'Lønperiode slut' },
    { key: 'paid', label: 'Dispositionsdato' },
    { key: 'forud', label: 'Forud/bagud' },
    { key: 'type', label: 'Indkomsttype' },
    { key: 'cpr', label: 'CPR-nummer' },
    { key: 'f36', label: `Felt ${FIELD_36}` },
];
const MENU_TIP = 'Mangler punktet? Tilmeld det under Ændre tilmeldingsoplysninger.';
const EINDKOMST_GUIDE = [
    { name: 'Log på TastSelv Erhverv', hint: 'Med dit MitID Erhverv' },
    { name: EINDKOMST_MENU[0], hint: '' },
    { name: EINDKOMST_MENU[1], hint: '' },
    { name: EINDKOMST_MENU[2], hint: MENU_TIP },
    { name: EINDKOMST_MENU[3], hint: 'Én indberetning pr. creator' },
];
const EINDKOMST_GLOSSARY = [
    { name: 'Lønperiode start og slut', what: 'Måneden, honoraret er for' },
    { name: 'Dispositionsdato', what: 'Dagen, du overførte' },
    { name: 'Forud/bagud', what: 'B (bagud)' },
    { name: 'Indkomsttype', what: `${INCOME_TYPE} (B-indkomst)` },
    { name: 'CPR-nummer', what: 'Creatorens' },
    { name: `Felt ${FIELD_36}`, what: 'Beløbet i hele kroner' },
];
const MONTH_NAMES = ['januar', 'februar', 'marts', 'april', 'maj', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'december'];
function monthPeriod(month) {
    const [y, m] = month.split('-').map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}` };
}
const formDate = (day) => day.slice(0, 10).replace(/-/g, '');
function longDate(day, refYear) {
    const [y, m, d] = day.slice(0, 10).split('-').map(Number);
    return `${d}. ${MONTH_NAMES[m - 1]}${refYear === String(y) ? '' : ` ${y}`}`;
}
function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function holidays(year) {
    const easter = easterSunday(year);
    return new Set([`${year}-01-01`, ...[-3, -2, 0, 1, 39, 49, 50].map((n) => addDays(easter, n)), `${year}-12-25`, `${year}-12-26`]);
}
function isWorkday(day) {
    const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
    return dow !== 0 && dow !== 6 && !holidays(Number(day.slice(0, 4))).has(day);
}
function eIndkomstDeadline(paidMonth) {
    const [y, m] = paidMonth.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    let day = `${next}-${m === 12 ? '17' : '10'}`;
    while (!isWorkday(day))
        day = addDays(day, 1);
    return day;
}
const wholeKroner = (ore) => String(Math.round(ore / 100));
function reportMonths(rows, kinds, names, today = null) {
    const persons = rows.filter((p) => p.status === 'paid' && p.paid_at && Number.isFinite(Date.parse(p.paid_at)) && kinds.get(p.creator_id) === 'person');
    const byMonth = new Map();
    for (const p of persons) {
        const at = Date.parse(p.paid_at ?? '');
        const r = { payoutId: p.id, creatorId: p.creator_id, name: names.get(p.creator_id) ?? 'Ukendt creator', month: p.month, paidDay: copenhagenDay(at), dueOre: Math.round(p.due_kr * 100), filed: p.reported_at !== null };
        const m = copenhagenMonth(at);
        byMonth.set(m, [...(byMonth.get(m) ?? []), r]);
    }
    return [...byMonth.entries()]
        .filter(([m, rs]) => rs.some((r) => !r.filed) || (today !== null && m === today.slice(0, 7)))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([paidMonth, rs]) => ({
        paidMonth,
        deadline: eIndkomstDeadline(paidMonth),
        rows: [...rs].sort((a, b) => a.month.localeCompare(b.month) || a.name.localeCompare(b.name, 'da') || a.payoutId.localeCompare(b.payoutId)),
        filed: rs.filter((r) => r.filed).length,
    }));
}
function fieldValues(r, cpr) {
    const { start, end } = monthPeriod(r.month);
    const year = r.paidDay.slice(0, 4);
    const exact = r.dueOre % 100 === 0;
    const v = {
        start: { value: formDate(start), hint: longDate(start, year) },
        end: { value: formDate(end), hint: longDate(end, year) },
        paid: { value: formDate(r.paidDay), hint: `${longDate(r.paidDay, year)}: dagen, du overførte` },
        forud: { value: 'B', hint: 'Bagud: betalt efter måneden' },
        type: { value: INCOME_TYPE, hint: 'B-indkomst' },
        cpr: { value: cpr, hint: cpr ? 'Uden bindestreg' : 'Hentes, når kortet åbner' },
        f36: { value: wholeKroner(r.dueOre), hint: exact ? 'Beløbet i hele kroner' : `Beløbet i hele kroner, afrundet fra ${formatKr(r.dueOre)}` },
    };
    return EINDKOMST_FIELDS.map((f) => ({ ...f, ...v[f.key] }));
}
const dotted = (day) => `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
function overviewText(m, cprs, today) {
    const [y, mo] = m.paidMonth.split('-').map(Number);
    const total = m.rows.reduce((a, r) => a + r.dueOre, 0);
    const lines = [
        'Indberetning til eIndkomst: B-indkomst, felt 36',
        `Overført i ${MONTH_NAMES[mo - 1]} ${y} · frist ${longDate(m.deadline)}`,
        `Indkomsttype ${INCOME_TYPE} (B-indkomst mm.) · bagud`,
        '',
    ];
    for (const r of m.rows) {
        const { start, end } = monthPeriod(r.month);
        const cpr = cprs.get(r.creatorId);
        lines.push(r.name, `  CPR-nummer: ${cpr ? `${cpr.slice(0, 6)}-${cpr.slice(6)}` : 'kunne ikke hentes'}`, `  Lønperiode: ${dotted(start)} - ${dotted(end)}`, `  Dispositionsdato: ${dotted(r.paidDay)}`, `  Felt 36: ${wholeKroner(r.dueOre)} kr${r.dueOre % 100 === 0 ? '' : ` (overført ${formatKr(r.dueOre)})`}`, `  ${r.filed ? 'Indberettet' : 'Ikke markeret som indberettet'}`, '');
    }
    lines.push(`I alt: ${m.rows.length} ${m.rows.length === 1 ? 'person' : 'personer'}, ${formatKr(total)}`, `Kopieret ${dotted(today)} fra PrepNow creator-admin`);
    return lines.join('\n');
}

// scripts/site/creator/admin.ts
const TAB_SLUGS = [['review', 'ok'], ['count', 'optaelling'], ['posted', 'lagt-op'], ['payout', 'udbetaling'], ['creators', 'creators'], ['history', 'historik']];
const adState = (s) => {
    byId('indhold').dataset.state = s;
};
const clock = new Intl.DateTimeFormat('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' });
const when = (iso, month) => (iso && Number.isFinite(Date.parse(iso)) ? `${shortDate(copenhagenDay(Date.parse(iso)), month)} kl. ${clock.format(new Date(iso))}` : '–');
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
const urlOf = (v, p) => (p === 'tiktok' ? v.tiktok_url : v.instagram_url);
const onPlatforms = (v) => ['tiktok', 'instagram'].filter((p) => urlOf(v, p) !== null);
const titleOf = (v) => v.title ?? 'Uden titel';
function whoLine(c) {
    if (!c)
        return h('div', { class: 'ad-who' }, h('span', { class: 'ad-who__name' }, 'Ukendt creator'));
    const initial = (c.name.trim()[0] ?? '?').toUpperCase();
    return h('div', { class: 'ad-who' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, initial), h('span', { class: 'ad-who__name' }, c.name), c.code ? chip(c.code, 'muted') : null, h('span', { class: 'ad-who__handles' }, [c.tiktok, c.instagram].filter(Boolean).join(' · ')));
}
function facts(pairs) {
    return h('dl', { class: 'ad-facts' }, ...pairs.map(([dt, dd]) => h('div', {}, h('dt', {}, dt), h('dd', {}, dd))));
}
function media(path, kind, gone) {
    if (!path)
        return h('div', { class: 'ad-media is-gone' }, icon(ICONS.film), h('span', {}, gone));
    const label = kind === 'draft' ? 'Udkastet' : 'Skærmoptagelsen af statistikken';
    return h('div', { class: 'ad-media' }, h('video', { class: 'ad-video', controls: '', playsinline: '', preload: 'metadata', 'data-path': path, 'aria-label': label }), h('span', { class: 'ad-media__tag' }, kind === 'draft' ? 'Udkast' : 'Skærmoptagelse'));
}
function reasonForm(id, label, quick, sendText, onSend, onCancel) {
    const area = h('textarea', { class: 'pt-input kt-textarea', id, rows: '3', maxlength: String(NOTE_MAX), placeholder: 'Skriv kort og venligt, hvad der skal til.' });
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const send = h('button', { class: 'btn btn--sm ad-btn--no', type: 'submit' }, sendText);
    const cancel = h('button', { class: 'btn btn--soft btn--sm', type: 'button' }, 'Fortryd');
    const chips = quick.map((q) => {
        const b = h('button', { class: 'ad-quick', type: 'button' }, q);
        b.addEventListener('click', () => {
            area.value = area.value.trim() ? `${area.value.trim()} ${q}` : q;
            area.focus();
        });
        return b;
    });
    const form = h('form', { class: 'ad-reason', hidden: '' }, h('label', { class: 'pt-label', for: id }, label), h('div', { class: 'ad-quicks' }, ...chips), area, msg, h('div', { class: 'ad-actions' }, send, cancel));
    cancel.addEventListener('click', () => {
        form.hidden = true;
        onCancel();
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const reason = area.value.trim();
        if (!reason) {
            area.setAttribute('aria-invalid', 'true');
            return say(msg, 'error', 'Skriv en grund. Creatoren ser den.');
        }
        send.disabled = true;
        const failed = await onSend(reason);
        send.disabled = false;
        if (failed)
            say(msg, 'error', failed);
    });
    area.addEventListener('input', () => area.removeAttribute('aria-invalid'));
    return {
        form,
        open: () => {
            form.hidden = false;
            area.focus();
        },
    };
}
const DRAFT_REASONS = ['Du siger ikke din kode i videoen.', 'Appen bliver ikke vist tydeligt nok.', 'Lyden eller billedet er for dårligt.', 'Videoen følger ikke reglerne på creator-siden.'];
const VIDEO_REASONS = ['Tallene i optagelsen passer ikke med videoen.', 'Videoen er ikke den, vi sagde ok til.', 'Videoen er taget ned.'];
function reviewCard(v, x) {
    const c = x.view.names.get(v.creator_id);
    const month = x.view.month;
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const approve = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, icon(ICONS.check), 'Godkend');
    const decline = h('button', { class: 'btn btn--soft btn--sm', type: 'button' }, 'Afvis');
    const actions = h('div', { class: 'ad-actions' }, approve, decline);
    const reason = reasonForm(`ad-why-${v.id}`, `Hvorfor ikke? ${c?.name.split(' ')[0] ?? 'Creatoren'} ser grunden.`, DRAFT_REASONS, 'Send afvisning', async (why) => {
        const failed = await x.backend.rpc('creator_admin_decide', { video_id: v.id, approve: false, reason: why });
        if (!failed)
            await x.done(`Afvist: ${titleOf(v)}. ${c?.name ?? 'Creatoren'} kan se grunden.`);
        return failed;
    }, () => {
        actions.hidden = false;
        decline.focus();
    });
    approve.addEventListener('click', async () => {
        approve.disabled = true;
        const failed = await x.backend.rpc('creator_admin_decide', { video_id: v.id, approve: true, reason: null });
        approve.disabled = false;
        if (failed)
            return say(msg, 'error', failed);
        await x.done(`Godkendt: ${titleOf(v)}. ${c?.name ?? 'Creatoren'} kan nu lægge den op.`);
    });
    decline.addEventListener('click', () => {
        actions.hidden = true;
        reason.open();
    });
    const waited = v.created_at ? daysBetween(copenhagenDay(Date.parse(v.created_at)), x.view.today) : 0;
    return h('article', { class: 'card ad-item', 'aria-label': titleOf(v) }, media(v.draft_path, 'draft', 'Udkastet er slettet'), h('div', { class: 'ad-info' }, whoLine(c), h('h3', { class: 'ad-title' }, titleOf(v)), h('div', { class: 'ad-sent' }, waited >= 2 ? chip(`Har ventet ${waited} dage`, 'wait') : null, sub(`Sendt ${when(v.created_at, month)}${waited === 1 ? ' (i går)' : waited === 0 ? ' (i dag)' : ''}`)), v.draft_note ? h('blockquote', { class: 'ad-quote' }, h('span', { class: 'sr-only' }, 'Besked fra creatoren: '), v.draft_note) : null, actions, reason.form, msg));
}
function countCard(v, x) {
    const c = x.view.names.get(v.creator_id);
    const month = x.view.month;
    const plats = onPlatforms(v);
    const inputs = new Map();
    const basisCells = new Map();
    const whyCells = new Map();
    const rows = plats.map((p) => {
        const views = p === 'tiktok' ? v.tiktok_views : v.instagram_views;
        const people = p === 'tiktok' ? v.tiktok_viewers : v.instagram_viewers;
        const id = `ad-pub-${v.id}-${p}`;
        const input = h('input', { class: 'pt-input ad-pub', id, inputmode: 'numeric', autocomplete: 'off', placeholder: 'Læs under videoen' });
        inputs.set(p, input);
        const basis = h('b', { class: 'ad-basis' }, '–');
        const why = h('span', { class: 'kt-sub ad-basis__why' });
        basisCells.set(p, basis);
        whyCells.set(p, why);
        return h('div', { class: 'ad-plat' }, h('div', { class: 'ad-plat__name' }, platformBadge(p, urlOf(v, p))), h('div', { class: 'ad-plat__cell' }, h('span', { class: 'ad-k' }, 'Creatorens tal'), h('b', {}, `${formatInt(views ?? 0)} visninger`), sub(`${formatInt(people ?? 0)} ${VIEWERS_WORD[p].toLowerCase()}`)), h('div', { class: 'ad-plat__cell' }, h('label', { class: 'ad-k', for: id }, 'Offentligt tal'), input), h('div', { class: 'ad-plat__cell ad-plat__basis' }, h('span', { class: 'ad-k' }, 'Tæller med'), basis, why));
    });
    const flags = h('div', { class: 'ad-flagbox', 'aria-live': 'polite' });
    const payKr = h('b', { class: 'ad-pay__kr' }, '–');
    const payNote = h('span', { class: 'ad-pay__note' }, 'Skriv de offentlige visninger for at se betalingen.');
    const payChips = h('div', { class: 'kt-flags' });
    const payBox = h('div', { class: 'ad-pay' }, h('span', { class: 'ad-k' }, 'Betaling for videoen'), payKr, payNote, payChips);
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const ok = h('button', { class: 'btn btn--violet btn--sm', type: 'button', disabled: '' }, icon(ICONS.check), 'Godkend tal');
    const no = h('button', { class: 'btn btn--soft btn--sm', type: 'button' }, 'Betal ikke');
    const actions = h('div', { class: 'ad-actions' }, ok, no);
    const typed = () => new Map(plats.map((p) => [p, typedCount(inputs.get(p)?.value ?? '')]));
    const update = () => {
        const t = typed();
        const all = plats.every((p) => t.get(p) !== null);
        const pay = countPreview(v, t.get('tiktok') ?? null, t.get('instagram') ?? null);
        const lines = [];
        for (const p of plats) {
            const reported = p === 'tiktok' ? v.tiktok_views : v.instagram_views;
            const pub = t.get(p) ?? null;
            const pp = pay.platforms.find((q) => q.platform === p);
            basisCells.get(p).textContent = pub === null ? '–' : formatInt(pp?.counted ?? 0);
            const lower = pub !== null && reported !== null && pub > reported;
            const capped = pub !== null && pp !== undefined && pp.basis !== null && pp.counted < pp.basis;
            whyCells.get(p).textContent = capped ? `af ${formatInt(pp?.basis ?? 0)} · højst 2 pr. ${p === 'tiktok' ? 'seer' : 'konto'}` : lower ? 'creatorens tal er lavest' : '';
            inputs.get(p).removeAttribute('aria-invalid');
            const over = overPercent(reported, pub);
            if (over !== null && over > OVERREPORT_PCT) {
                inputs.get(p).setAttribute('aria-invalid', 'true');
                lines.push(h('p', { class: 'pt-msg pt-msg--error ad-flag' }, icon(ICONS.alert), h('span', {}, h('b', {}, `${PLATFORM_NAME[p]}: ${over === Infinity ? 'over 100' : over} % mere end det offentlige tal. `), `Creatoren skrev ${formatInt(reported ?? 0)}, under videoen står ${formatInt(pub ?? 0)}. Tjek skærmoptagelsen. Vi betaler efter ${formatInt(pub ?? 0)}.`)));
            }
            else if (pub !== null && reported !== null && pub < reported) {
                lines.push(h('p', { class: 'pt-msg pt-msg--info' }, icon(ICONS.info), h('span', {}, `${PLATFORM_NAME[p]}: ${over ?? 0} % over det offentlige tal, inden for de ${OVERREPORT_PCT} %. Vi betaler efter det offentlige tal.`)));
            }
        }
        flags.replaceChildren(...lines);
        ok.disabled = !all;
        payChips.replaceChildren();
        payBox.classList.toggle('is-empty', !all);
        if (!all) {
            payKr.textContent = '–';
            payNote.textContent = plats.length > 1 ? 'Skriv de offentlige visninger for begge platforme.' : 'Skriv de offentlige visninger for at se betalingen.';
            return;
        }
        payKr.textContent = formatKr(pay.ore);
        payNote.textContent = `${formatInt(pay.counted)} visninger tæller med · før puljen`;
        if (pay.capped)
            payChips.append(chip(`Max ${CREATOR_PAY.perVideoCap} kr nået`, 'lime'));
    };
    for (const input of inputs.values()) {
        input.addEventListener('input', update);
        input.addEventListener('blur', () => {
            const n = typedCount(input.value);
            if (n !== null)
                input.value = formatInt(n);
        });
    }
    ok.addEventListener('click', async () => {
        const t = typed();
        ok.disabled = true;
        const failed = await x.backend.rpc('creator_admin_count', { video_id: v.id, tiktok_public: v.tiktok_url ? t.get('tiktok') : null, instagram_public: v.instagram_url ? t.get('instagram') : null, seen_stats_at: v.stats_sent_at ?? null });
        if (failed) {
            ok.disabled = false;
            return say(msg, 'error', failed);
        }
        await x.done(`Talt: ${titleOf(v)}. ${c?.name ?? 'Creatoren'} får ${payKr.textContent} før puljen.`);
    });
    const reason = reasonForm(`ad-no-${v.id}`, 'Hvorfor betaler vi ikke? Creatoren ser grunden.', VIDEO_REASONS, 'Betal ikke for videoen', async (why) => {
        const failed = await x.backend.rpc('creator_admin_reject', { video_id: v.id, reason: why });
        if (!failed)
            await x.done(`Ikke betalt: ${titleOf(v)}. ${c?.name ?? 'Creatoren'} kan se grunden.`);
        return failed;
    }, () => {
        actions.hidden = false;
    });
    no.addEventListener('click', () => {
        actions.hidden = true;
        reason.open();
    });
    update();
    return h('article', { class: 'card ad-item ad-item--count', 'aria-label': titleOf(v) }, media(v.stats_path, 'stats', 'Ingen skærmoptagelse'), h('div', { class: 'ad-info' }, whoLine(c), h('h3', { class: 'ad-title' }, titleOf(v)), facts([
        ['Lagt op', v.posted_on ? shortDate(v.posted_on, month) : '–'],
        ['Tælles', statsOpenOn(v) ? shortDate(statsOpenOn(v) ?? '', month) : '–'],
        ['Statistik sendt', when(v.stats_sent_at, month)],
    ]), h('div', { class: 'ad-plats' }, ...rows), flags, payBox, actions, reason.form, msg));
}
function lineRow(v, x, status, detail, extra = null) {
    const c = x.view.names.get(v.creator_id);
    return h('li', { class: 'ad-line' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, (c?.name.trim()[0] ?? '?').toUpperCase()), h('div', { class: 'ad-line__main' }, h('span', { class: 'ad-line__title' }, titleOf(v)), h('span', { class: 'ad-line__who' }, `${c?.name ?? 'Ukendt'}${c?.code ? ` · ${c.code}` : ''}`), onPlatforms(v).length ? h('div', { class: 'kt-v__plats' }, ...onPlatforms(v).map((p) => platformBadge(p, urlOf(v, p)))) : null, sub(detail), extra), h('div', { class: 'ad-line__status' }, status));
}
function postedPanel(x) {
    const { view } = x;
    const month = view.month;
    const out = [];
    if (view.approved.length) {
        out.push(h('section', { class: 'card ad-group', 'aria-label': 'Godkendt, mangler link' }, h('div', { class: 'kt-head' }, h('h2', {}, 'Godkendt, mangler link'), chip(String(view.approved.length))), h('ul', { class: 'ad-lines' }, ...view.approved.map((v) => {
            const d = v.decided_at ? daysBetween(copenhagenDay(Date.parse(v.decided_at)), view.today) : 0;
            const last = postDeadline(v);
            return lineRow(v, x, chip(d === 0 ? 'Godkendt i dag' : `Godkendt for ${d} ${d === 1 ? 'dag' : 'dage'} siden`, 'lime'), `Godkendt ${when(v.decided_at, month)}${last ? ` · skal op senest ${shortDate(last, month)}` : ''}`);
        }))));
    }
    if (view.posted.length) {
        out.push(h('section', { class: 'card ad-group', 'aria-label': 'Lagt op' }, h('div', { class: 'kt-head' }, h('h2', {}, 'Lagt op'), chip(String(view.posted.length))), h('ul', { class: 'ad-lines' }, ...view.posted.map((v) => {
            const open = statsOpenOn(v) ?? view.today;
            const left = daysBetween(view.today, open);
            const status = left > 0 ? chip(`Tælles om ${left} ${left === 1 ? 'dag' : 'dage'}`, 'muted') : chip(left === 0 ? 'Statistik kan sendes i dag' : `Statistik mangler · ${-left} ${left === -1 ? 'dag' : 'dage'} over`, -left >= 7 ? 'no' : 'wait');
            const no = h('button', { class: 'pt-linkbtn ad-mini ad-quiet', type: 'button' }, 'Betal ikke');
            const wrap = h('div', { class: 'ad-line__more' }, no);
            const reason = reasonForm(`ad-pno-${v.id}`, 'Hvorfor betaler vi ikke? Creatoren ser grunden.', VIDEO_REASONS, 'Betal ikke for videoen', async (why) => {
                const failed = await x.backend.rpc('creator_admin_reject', { video_id: v.id, reason: why });
                if (!failed)
                    await x.done(`Ikke betalt: ${titleOf(v)}.`);
                return failed;
            }, () => {
                no.hidden = false;
            });
            no.addEventListener('click', () => {
                no.hidden = true;
                reason.open();
            });
            wrap.append(reason.form);
            return lineRow(v, x, status, `Lagt op ${v.posted_on ? shortDate(v.posted_on, month) : '–'} · tælles ${shortDate(open, month)} · i ${monthName(v.month ?? month, month)}-puljen`, wrap);
        }))));
    }
    return out;
}
function historyPanel(x) {
    const { view } = x;
    const month = view.month;
    if (!view.history.length)
        return [];
    return [
        h('section', { class: 'card ad-group', 'aria-label': 'Historik' }, h('ul', { class: 'ad-lines' }, ...view.history.map((v) => {
            if (v.state === 'counted') {
                const pay = countPreview(v, v.tiktok_public_views, v.instagram_public_views);
                const flagged = pay.platforms.some((p) => p.flagged);
                return lineRow(v, x, chip(formatKr(pay.ore), 'lime'), `Talt ${when(v.counted_at, month)} · ${formatInt(pay.views)} visninger${pay.reported > pay.views ? ` (creatoren skrev ${formatInt(pay.reported)})` : ''} · i ${monthName(v.month ?? month, month)}-puljen`, flagged ? h('div', { class: 'kt-flags' }, chip(`Over ${OVERREPORT_PCT} % for højt`, 'no')) : null);
            }
            const declined = v.state === 'declined';
            const gone = v.draft_path ? draftGoneOn(v) : null;
            return lineRow(v, x, chip(declined ? 'Afvist udkast' : 'Ikke betalt', 'no'), `${declined ? 'Afvist' : 'Sat til ikke betalt'} ${when(declined ? v.decided_at : (v.closed_at ?? v.decided_at), month)}${gone ? ` · udkastet slettes ${shortDate(gone, month)}` : ''}`, v.note ? h('p', { class: 'ad-reasonline' }, h('span', { class: 'sr-only' }, 'Grund: '), `"${v.note}"`) : null);
        }))),
    ];
}
const notThereYet = (message) => /PGRST202|PGRST205|could not find the (function|table)|does not exist|schema cache/i.test(message);
const REVEAL_S = 120;
const netbankAmount = (ore) => (ore / 100).toFixed(2).replace('.', ',');
const firstName = (c) => c?.name.trim().split(/\s+/)[0] ?? 'Creatoren';
const part = (label, ore) => `${label} ${formatKr(ore)}`;
const mailTo = (c, owedOre) => `mailto:${c.email}?subject=${encodeURIComponent('Dine udbetalingsoplysninger til PrepNow')}&body=${encodeURIComponent(`Hej ${firstName(c)}\n\nDu har ${formatKr(owedOre).replace(' ', ' ')} til gode fra PrepNow. Skriv dit navn, din adresse, dit CPR-nummer (eller CVR-nummer) og din bankkonto under "Udbetaling" på din creator-konto, så overfører vi pengene: https://prepnow.dk/creator/konto/#udbetaling\n\nKh PrepNow`)}`;
function tracker(kind, p) {
    const steps = kind === 'company'
        ? [['Oplysninger', 'Oplysninger', true], ['Faktura modtaget', 'Faktura', p.invoice_at !== null], ['Overført', 'Overfør', p.status === 'paid']]
        : [['Oplysninger', 'Oplysninger', true], ['Overført', 'Overfør', p.status === 'paid'], ['Indberettet', 'Indberet', p.reported_at !== null]];
    const now = steps.findIndex(([, , done]) => !done);
    return h('ol', { class: 'ad-track', 'aria-label': `Trin ${now < 0 ? steps.length : now + 1} af ${steps.length}` }, ...steps.map(([doneLabel, todo, done], i) => h('li', { class: done ? 'is-done' : i === now ? 'is-now' : '', 'aria-current': i === now ? 'step' : undefined }, h('i', { 'aria-hidden': 'true' }, done ? icon(ICONS.check) : String(i + 1)), h('span', {}, done ? doneLabel : todo, h('span', { class: 'sr-only' }, done ? ' (klaret)' : i === now ? ' (nu)' : '')))));
}
function kv(label, value, copy = null, cls = '') {
    return h('div', { class: `ad-kv${cls ? ` ${cls}` : ''}` }, h('dt', {}, label), h('dd', {}, h('span', { class: 'ad-kv__v' }, value), copy ? copyButton(copy, label.toLowerCase()) : null));
}
function payeeBox(card, y, x) {
    const taxLabel = KIND_TEXT[y.kind].tax;
    const list = h('dl', { class: 'ad-kvs' });
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const toggle = h('button', { class: 'btn btn--soft btn--sm ad-reveal', type: 'button', 'aria-expanded': 'false' }, icon(ICONS.eye), 'Vis numre');
    const note = h('span', { class: 'kt-sub ad-reveal__note' });
    let timer = 0;
    let left = 0;
    const masked = () => {
        window.clearInterval(timer);
        list.replaceChildren(kv('Modtager', y.full_name), kv('Adresse', `${y.address}, ${y.postcode} ${y.city}`, null, 'ad-kv--wide'), kv(taxLabel, maskTaxId(y.kind, y.tax_id_last4), null, 'ad-kv--tax'), kv('Reg.nr.', '••••'), kv('Kontonr.', `••••${y.account_last4}`));
        list.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.replaceChildren(icon(ICONS.eye), 'Vis numre');
        note.textContent = 'Numrene vises kun, når du trykker, og skjules igen efter 2 minutter.';
    };
    const tick = () => {
        left -= 1;
        if (left <= 0)
            return masked();
        note.textContent = `Skjules igen om ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    };
    const full = (f) => {
        const address = `${f.address}, ${f.postcode} ${f.city}`;
        list.replaceChildren(kv('Modtager', f.full_name, () => f.full_name), kv('Adresse', address, () => address, 'ad-kv--wide'), kv(KIND_TEXT[f.kind].tax, formatTaxId(f.kind, f.tax_id), () => f.tax_id, 'ad-kv--tax'), kv('Reg.nr.', f.reg_no, () => f.reg_no), kv('Kontonr.', f.account, () => f.account));
        list.classList.add('is-open');
        toggle.setAttribute('aria-expanded', 'true');
        toggle.replaceChildren(icon(ICONS.lock), 'Skjul');
        window.clearInterval(timer);
        left = REVEAL_S + 1;
        tick();
        timer = window.setInterval(tick, 1000);
    };
    toggle.addEventListener('click', async () => {
        if (toggle.getAttribute('aria-expanded') === 'true')
            return masked();
        toggle.disabled = true;
        const r = await x.backend.call('creator_admin_payee', { who: card.p.creator_id });
        toggle.disabled = false;
        const f = r.error ? null : parsePayeeFull(r.data);
        if (!f)
            return say(msg, 'error', r.error ?? 'Oplysningerne kunne ikke hentes. Prøv igen.');
        say(msg, null);
        full(f);
    });
    masked();
    return h('div', { class: 'ad-payee' }, list, h('div', { class: 'ad-payee__foot' }, toggle, note), msg);
}
function payoutCard(card, x) {
    const { p, c, step } = card;
    const payee = card.payee;
    const month = x.month;
    const name = c?.name ?? 'Ukendt creator';
    const first = firstName(c);
    const amount = formatKr(card.dueOre);
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const parts = [part('Visninger', Math.round(p.views_kr * 100)), part('Abonnenter', Math.round(p.subs_kr * 100))];
    if (p.carried_kr > 0)
        parts.push(part(card.carriedFrom.length ? `Fra ${card.carriedFrom.map((m) => monthName(m, month)).join(' og ')}` : 'Fra tidligere', Math.round(p.carried_kr * 100)));
    const run = async (fn, btn, said) => {
        btn.disabled = true;
        const r = await x.backend.call(fn, { payout_id: p.id });
        btn.disabled = false;
        if (r.error)
            return say(msg, 'error', r.error);
        await x.done(said);
    };
    const actions = h('div', { class: 'ad-actions' });
    const main = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, icon(ICONS.check));
    let hint;
    let confirm = null;
    if (step === 'pay') {
        main.append('Markér som betalt');
        const yes = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, 'Ja, den er overført');
        const no = h('button', { class: 'btn btn--soft btn--sm', type: 'button' }, 'Fortryd');
        confirm = h('div', { class: 'ad-confirm', hidden: '', role: 'group', 'aria-label': 'Bekræft betaling' }, h('p', {}, `Har du overført ${amount} til ${name} (konto ••••${payee.account_last4}) fra netbank?`), h('div', { class: 'ad-actions' }, yes, no));
        main.addEventListener('click', () => {
            actions.hidden = true;
            confirm.hidden = false;
            yes.focus();
        });
        no.addEventListener('click', () => {
            confirm.hidden = true;
            actions.hidden = false;
            main.focus();
        });
        yes.addEventListener('click', () => void run('creator_admin_mark_paid', yes, `Betalt: ${amount} til ${name}.${payee.kind === 'person' ? ' Indberet det under "Indberet til SKAT".' : ''}`));
        hint = h('p', { class: 'ad-next' }, payee.kind === 'company' ? `Fakturaen er modtaget. Overfør ${amount} fra netbank til kontoen herover.` : `Overfør hele beløbet fra netbank. Intet trækkes fra: ${first} betaler selv skatten.`);
    }
    else {
        main.append('Markér faktura modtaget');
        main.addEventListener('click', () => void run('creator_admin_mark_filed', main, `Faktura modtaget fra ${name}. Nu kan du overføre ${amount}.`));
        hint = h('p', { class: 'ad-next' }, `${first} har CVR-nummer og sender en faktura på ${amount}. Overfør, når den er kommet.`);
    }
    actions.append(main);
    let flag = null;
    if (card.changedSincePaid && (step === 'pay' || step === 'invoice')) {
        const id = `ad-checked-${p.id}`;
        const box = h('input', { type: 'checkbox', id });
        main.disabled = true;
        const why = h('span', { class: 'kt-sub ad-why' }, 'Sæt flueben ovenfor først');
        actions.append(why);
        box.addEventListener('change', () => {
            main.disabled = !box.checked;
            why.hidden = box.checked;
        });
        flag = h('div', { class: 'pt-msg pt-msg--error ad-flag', role: 'group', 'aria-label': 'Kontoen er ændret' }, icon(ICONS.alert), h('div', {}, h('p', {}, h('b', {}, 'Kontoen er ændret siden sidste udbetaling. '), `${first} rettede sine oplysninger ${when(payee.updated_at, month).replace(/ /g, '\u00a0')}. Ring eller skriv til ${first}, og hør om det passer, før du overfører.`), h('label', { class: 'ad-check', for: id }, box, h('span', {}, `Jeg har tjekket kontoen med ${first}`))));
    }
    return h('article', { class: `card ad-payout is-${step}`, 'aria-label': `${name}, ${amount}` }, h('div', { class: 'ad-payout__top' }, h('div', { class: 'ad-who' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, (name.trim()[0] ?? '?').toUpperCase()), h('span', { class: 'ad-who__name' }, name), chip(payee.kind === 'person' ? 'Privatperson' : 'Virksomhed', 'muted')), p.status === 'paid'
        ? h('div', { class: 'ad-payout__kr is-paid' }, h('b', {}, amount), h('span', { class: 'ad-paid-at' }, icon(ICONS.check), `Overført ${p.paid_at ? shortDate(copenhagenDay(Date.parse(p.paid_at)), month) : ''}`))
        : h('div', { class: 'ad-payout__kr' }, h('b', {}, amount), copyButton(() => netbankAmount(card.dueOre), `beløbet ${amount}`))), h('p', { class: 'ad-payout__parts' }, `For ${monthName(p.month, month)} · ${parts.join(' · ')}`), tracker(payee.kind, p), flag, payeeBox(card, payee, x), hint, confirm, actions, msg);
}
function payLine(name, amount, detail, extra = null) {
    return h('li', { class: 'ad-line ad-line--pay' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, (name.trim()[0] ?? '?').toUpperCase()), h('div', { class: 'ad-line__main' }, h('span', { class: 'ad-line__title' }, name), sub(detail), extra), h('div', { class: 'ad-line__status' }, amount));
}
function payGroup(title, n, lines) {
    return h('section', { class: 'card ad-group', 'aria-label': title }, h('div', { class: 'kt-head' }, h('h2', {}, title), n > 1 ? chip(String(n)) : null), h('ul', { class: 'ad-lines' }, ...lines));
}
const skatAt = new Map();
async function fetchCpr(x, creatorId) {
    const r = await x.backend.call('creator_admin_payee', { who: creatorId });
    const f = r.error ? null : parsePayeeFull(r.data);
    return f && f.kind === 'person' && /^\d{10}$/.test(f.tax_id) ? f.tax_id : null;
}
function deadlineChip(m, today) {
    const date = longDate(m.deadline, today.slice(0, 4));
    if (m.filed === m.rows.length)
        return chip('Alt indberettet', 'lime');
    if (m.deadline < today)
        return chip(`Fristen var ${date}`, 'no');
    if (m.deadline === today)
        return chip(`Frist i dag, ${date}`, 'no');
    const left = daysBetween(today, m.deadline);
    return chip(`Frist: ${date} · om ${left} ${left === 1 ? 'dag' : 'dage'}`, left <= 5 ? 'wait' : '');
}
const forMonths = (m, year) => [...new Set(m.rows.map((r) => r.month))].sort().map((mo) => monthName(mo, `${year}-01`)).join(' og ');
function fieldRow(n, key, label, value, hint, pending = null) {
    const li = h('li', { class: `ad-field ad-field--${key}${value === null ? ' is-waiting' : ''}` });
    const num = h('span', { class: 'ad-field__n', 'aria-hidden': 'true' }, String(n));
    let copy = h('span', { class: 'ad-field__gap', 'aria-hidden': 'true' });
    if (value !== null) {
        copy = copyButton(() => value, `${label.toLowerCase()} ${value}`, 'ad-copy--big');
        copy.addEventListener('copied', () => {
            li.classList.add('is-copied');
            num.replaceChildren(icon(ICONS.check));
        });
    }
    li.append(num, h('b', { class: 'ad-field__name' }, label), h('small', { class: 'ad-field__hint' }, hint), h('div', { class: 'ad-field__value' }, value !== null ? h('output', {}, value) : pending), copy);
    return li;
}
function skatFlow(m, x, waiting = []) {
    const year = x.today.slice(0, 4);
    const paidName = monthName(m.paidMonth, `${year}-01`);
    const honorar = forMonths(m, year);
    const open = m.rows.filter((r) => !r.filed);
    const ids = ['start', ...m.rows.map((r) => r.payoutId), 'end'];
    const allDone = open.length === 0;
    let at = skatAt.get(m.paidMonth) ?? 'start';
    if (!ids.includes(at))
        at = 'start';
    if (allDone)
        at = 'end';
    const headId = `ad-skat-h-${m.paidMonth}`;
    const panel = h('div', { class: 'ad-skat__panel', tabindex: '-1' });
    const nav = h('ol', { class: 'ad-skat__nav', 'aria-label': 'Trin' });
    const msg = h('div', { class: 'pt-live', 'aria-live': 'polite' });
    const total = m.rows.length;
    const pct = Math.round((m.filed / Math.max(1, total)) * 100);
    const bar = h('i', {});
    bar.style.setProperty('--p', `${pct}%`);
    bar.hidden = pct === 0;
    const go = (to, focus = true) => {
        at = to;
        skatAt.set(m.paidMonth, to);
        draw();
        if (!focus)
            return;
        panel.focus({ preventScroll: true });
        const top = panel.getBoundingClientRect().top;
        if (top < 70 || top > window.innerHeight * 0.6)
            panel.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    const nextOf = (id) => ids[Math.min(ids.length - 1, ids.indexOf(id) + 1)];
    const firstName = (id) => (m.rows.find((r) => r.payoutId === id)?.name ?? '').split(' ')[0];
    const quiet = (text, go2, ico = null) => {
        const b = h('button', { class: 'pt-linkbtn ad-skat__quiet', type: 'button' }, ico ? icon(ico) : null, text);
        b.addEventListener('click', go2);
        return b;
    };
    const startStep = () => {
        const first = m.rows.find((r) => !r.filed) ?? m.rows[0];
        const openBtn = h('a', { class: 'btn btn--violet ad-skat__open', href: EINDKOMST_URL, target: '_blank', rel: 'noopener noreferrer' }, 'Åbn eIndkomst', icon(ICONS.out), h('span', { class: 'sr-only' }, ' (skat.dk, åbner i en ny fane)'));
        const next = h('button', { class: 'btn btn--soft', type: 'button' }, `Videre til ${first.name.split(' ')[0]}`, icon(ICONS.next));
        next.addEventListener('click', () => go(first.payoutId));
        return [
            h('div', { class: 'ad-skat__lead' }, h('span', { class: 'ad-skat__step' }, 'Først'), h('h3', {}, 'Log på og åbn eIndkomst'), h('p', {}, 'Log på skat.dk med dit MitID Erhverv. Vælg så:')),
            h('ol', { class: 'ad-skat__menu' }, ...EINDKOMST_MENU.map((t) => h('li', {}, t))),
            h('p', { class: 'kt-sub ad-skat__small' }, MENU_TIP),
            h('div', { class: 'ad-actions ad-skat__actions' }, openBtn, next),
        ];
    };
    const creatorStep = (r) => {
        const i = m.rows.indexOf(r);
        const list = h('ol', { class: 'ad-fields', 'aria-label': `Felterne for ${r.name}, i eIndkomsts rækkefølge` });
        const spinner = h('span', { class: 'ad-field__loading' }, h('i', { 'aria-hidden': 'true' }), 'Henter …');
        const draw = (cpr, failed) => {
            const retry = h('button', { class: 'pt-linkbtn', type: 'button' }, 'Prøv igen');
            retry.addEventListener('click', () => {
                draw(null, false);
                void load();
            });
            const pending = failed ? h('span', { class: 'ad-field__fail' }, 'Kunne ikke hentes. ', retry) : spinner;
            list.replaceChildren(...fieldValues(r, cpr).map((f, n) => fieldRow(n + 1, f.key, f.label, f.value, f.key === 'cpr' && failed ? 'Prøv igen, eller se "Vis numre"' : f.hint, f.key === 'cpr' ? pending : null)));
        };
        const load = async () => {
            const cpr = await fetchCpr(x, r.creatorId).catch(() => null);
            if (at !== r.payoutId || !list.isConnected)
                return;
            draw(cpr, cpr === null);
        };
        draw(null, false);
        void load();
        const next = nextOf(r.payoutId);
        const nextWord = next === 'end' ? 'til sidst' : `videre til ${firstName(next)}`;
        const main = h('button', { class: 'btn btn--violet', type: 'button' }, icon(ICONS.check), r.filed ? `${nextWord[0].toUpperCase()}${nextWord.slice(1)}` : `Indberettet, ${nextWord}`);
        main.addEventListener('click', async () => {
            if (r.filed)
                return go(next);
            main.disabled = true;
            const res = await x.backend.call('creator_admin_mark_filed', { payout_id: r.payoutId });
            main.disabled = false;
            if (res.error)
                return say(msg, 'error', res.error);
            const after = m.rows.slice(i + 1).find((q) => !q.filed);
            skatAt.set(m.paidMonth, after ? after.payoutId : 'end');
            await x.done(`Markeret som indberettet: ${r.name}.`);
        });
        return [
            h('div', { class: 'ad-skat__who' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, (r.name.trim()[0] ?? '?').toUpperCase()), h('div', {}, h('span', { class: 'ad-skat__step' }, `Creator ${i + 1} af ${total}`), h('h3', {}, r.name)), r.filed ? h('span', { class: 'ad-skat__filed' }, icon(ICONS.check), 'Indberettet') : h('div', { class: 'ad-skat__kr' }, h('b', {}, formatKr(r.dueOre)), h('small', {}, `overført ${shortDate(r.paidDay, `${year}-01`)}`))),
            h('p', { class: 'ad-skat__then' }, icon(ICONS.info), h('span', {}, 'Kopiér hvert felt ind i eIndkomst, oppefra og ned.')),
            list,
            h('div', { class: 'ad-skat__sticky' }, h('p', { class: 'ad-skat__then ad-skat__remind' }, icon(ICONS.info), h('span', { class: 'is-long' }, 'Husk at trykke ', h('b', {}, 'Fortsæt'), ' og ', h('b', {}, 'Bekræft indberetningen'), ' i eIndkomst.'), h('span', { class: 'is-short' }, 'Husk ', h('b', {}, 'Fortsæt'), ' og ', h('b', {}, 'Bekræft'), ' i eIndkomst.')), h('div', { class: 'ad-actions ad-skat__actions' }, main, h('div', { class: 'ad-skat__quiets' }, r.filed ? null : quiet('Spring over', () => go(next)), quiet('Tilbage', () => go(ids[ids.indexOf(r.payoutId) - 1]), ICONS.back)))),
            r.filed ? null : h('p', { class: 'kt-sub ad-skat__small' }, `${i + 1 < total ? 'Hver creator er sin egen indberetning. ' : ''}Markér sender intet til SKAT. Det er kun din egen huskeliste.`),
        ];
    };
    const endStep = () => {
        const overview = copyButton(async () => {
            const cprs = new Map();
            for (const r of m.rows) {
                const c = await fetchCpr(x, r.creatorId).catch(() => null);
                if (c)
                    cprs.set(r.creatorId, c);
            }
            return overviewText(m, cprs, x.today);
        }, `oversigten over ${paidName}`, 'ad-copy--big ad-copy--wide', 'Kopiér oversigt');
        const docs = h('div', { class: 'ad-skat__doc' }, h('div', {}, h('b', {}, 'Oversigt til dit bogholderi'), h('small', {}, 'Navn, CPR, periode og beløb i felt 36, som ren tekst.')), overview);
        if (allDone) {
            return [
                h('div', { class: 'ad-skat__done' }, h('span', { class: 'ad-skat__bloom', 'aria-hidden': 'true' }, icon(ICONS.check)), h('div', {}, h('h3', {}, `Alle ${total} er indberettet`), h('p', {}, `Honoraret for ${honorar} er klaret.${waiting.length ? ` ${waiting.join(', ').replace(/, ([^,]*)$/, ' og $1')} mangler stadig oplysninger og er ikke med her.` : ''}`))),
                docs,
            ];
        }
        const names = open.map((r) => r.name.split(' ')[0]).join(', ').replace(/, ([^,]*)$/, ' og $1');
        const yes = h('button', { class: 'btn btn--violet btn--sm', type: 'button' }, `Ja, markér ${open.length === 1 ? 'den' : `alle ${open.length}`}`);
        const no = h('button', { class: 'btn btn--soft btn--sm', type: 'button' }, 'Fortryd');
        const all = h('button', { class: 'btn btn--violet', type: 'button' }, icon(ICONS.check), open.length === 1 ? 'Markér som indberettet' : `Markér alle ${open.length} som indberettet`);
        const confirm = h('div', { class: 'ad-confirm', hidden: '', role: 'group', 'aria-label': 'Bekræft' }, h('p', {}, 'Har du trykket ', h('b', {}, 'Bekræft indberetningen'), ` i eIndkomst for ${names}?`), h('div', { class: 'ad-actions' }, yes, no));
        const allRow = h('div', { class: 'ad-actions ad-skat__actions' }, all, h('div', { class: 'ad-skat__quiets' }, quiet('Tilbage', () => go(ids[ids.length - 2]), ICONS.back)));
        all.addEventListener('click', () => {
            allRow.hidden = true;
            confirm.hidden = false;
            yes.focus();
        });
        no.addEventListener('click', () => {
            confirm.hidden = true;
            allRow.hidden = false;
            all.focus();
        });
        yes.addEventListener('click', async () => {
            yes.disabled = true;
            const failed = [];
            for (const r of open) {
                const res = await x.backend.call('creator_admin_mark_filed', { payout_id: r.payoutId });
                if (res.error)
                    failed.push(`${r.name}: ${res.error}`);
            }
            yes.disabled = false;
            if (failed.length === open.length)
                return say(msg, 'error', failed.join(' '));
            await x.done(failed.length ? `Markeret, undtagen ${failed.join(' ')}` : `Markeret som indberettet: ${open.length === 1 ? open[0].name : `alle ${open.length}`}.`);
        });
        return [
            h('div', { class: 'ad-skat__lead' }, h('span', { class: 'ad-skat__step' }, 'Til sidst'), h('h3', {}, 'Gem oversigten og markér dem som indberettet'), h('p', {}, `${open.length === 1 ? 'Mangler' : 'Mangler stadig'}: ${open.map((r) => r.name).join(', ')}.`)),
            docs,
            allRow,
            confirm,
        ];
    };
    const draw = () => {
        nav.replaceChildren(...ids.map((id) => {
            const r = m.rows.find((q) => q.payoutId === id);
            const label = id === 'start' ? 'Log på' : id === 'end' ? 'Til sidst' : (r?.name.split(' ')[0] ?? '');
            const mark = r?.filed ? icon(ICONS.check) : id === 'start' ? icon(ICONS.out) : id === 'end' ? icon(ICONS.flag) : String(m.rows.indexOf(r) + 1);
            const b = h('button', { class: `ad-skat__dot${id === at ? ' is-now' : ''}${r?.filed ? ' is-done' : ''}`, type: 'button', 'aria-current': id === at ? 'step' : undefined }, h('i', { 'aria-hidden': 'true' }, mark), h('span', {}, label, r?.filed ? h('span', { class: 'sr-only' }, ' (indberettet)') : null));
            b.addEventListener('click', () => go(id));
            return h('li', {}, b);
        }));
        const r = m.rows.find((q) => q.payoutId === at);
        panel.replaceChildren(...(at === 'start' ? startStep() : at === 'end' ? endStep() : r ? creatorStep(r) : startStep()).filter((e) => e !== null));
        say(msg, null);
    };
    draw();
    return h('section', { class: `card ad-skat${allDone ? ' is-done' : ''}`, 'aria-labelledby': headId }, h('div', { class: 'ad-skat__head' }, h('div', {}, h('h2', { id: headId }, 'Indberet til SKAT'), h('p', { class: 'ad-skat__sub' }, `Honorar for ${honorar} til ${total} ${total === 1 ? 'person' : 'personer'} uden CVR, overført i ${paidName}. Det er B-indkomst.`)), deadlineChip(m, x.today)), h('div', { class: 'ad-skat__progress' }, h('div', { class: 'ad-skat__bar', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(m.filed), 'aria-label': 'Indberettet' }, bar), h('span', {}, h('b', {}, `${m.filed} af ${total}`), ' indberettet')), allDone ? null : nav, panel, msg);
}
const NARROW = '(max-width: 980px)';
function placeGuide(inCard) {
    const guide = byId('ad-guide');
    const more = byId('ad-guide-more');
    const narrow = matchMedia(NARROW).matches;
    const card = inCard && narrow ? document.querySelector('#ad-payout-list .ad-skat:not(.is-done)') : null;
    const wasInside = guide.classList.contains('is-inside');
    if (card) {
        card.append(guide);
        guide.classList.add('is-inside');
        if (!wasInside)
            more.open = false;
        return;
    }
    if (guide.parentElement?.id !== 'ad-paygrid')
        byId('ad-paygrid').append(guide);
    guide.classList.remove('is-inside');
    if (inCard)
        more.open = !narrow;
}
const COUNT_TEXT = { pay: 'at overføre', invoice: 'venter på faktura', report: 'at indberette', details: 'mangler oplysninger' };
function renderPayouts(o, state, now, x) {
    const sum = byId('ad-paysum');
    const list = byId('ad-payout-list');
    const more = byId('ad-payout-more');
    if (state === 'off' || state === 'error') {
        sum.replaceChildren(h('div', { class: 'kt-head' }, h('h2', {}, 'Udbetaling')), h('p', { class: 'kt-note' }, state === 'off' ? 'Udbetaling er ikke slået til endnu: databasen mangler migration 0026. Indtil da kører udbetalingen med creator-admin.ts payout.' : 'Udbetalingerne kunne ikke hentes. Prøv at genindlæse siden.'));
        list.replaceChildren();
        more.replaceChildren();
        byId('ad-payout-empty').hidden = true;
        return { n: 0, hot: false };
    }
    const v = payoutView(o, state, now);
    const monthLabel = monthName(v.month, v.month);
    const owedMissing = v.missing.filter((m) => m.dueOre > 0);
    const counts = ['pay', 'invoice', 'report', 'details'].map((s) => [s, s === 'details' ? owedMissing.length : v.todo.filter((t) => t.step === s).length]).filter(([, n]) => n > 0);
    const head = h('div', { class: 'kt-head' }, h('h2', { id: 'ad-paysum-h' }, `Udbetaling for ${monthLabel}`), v.open ? chip('Ikke gjort op', 'wait') : v.todo.length ? chip(`${v.todo.length} venter på dig`) : chip('Alt er klaret', 'lime'));
    const cmd = `npx tsx scripts/tools/creator-admin.ts payout ${v.month} --yes`;
    const callout = v.open
        ? h('div', { class: 'ad-open-month' }, h('p', {}, h('b', {}, `${monthLabel[0].toUpperCase()}${monthLabel.slice(1)} er ikke gjort op endnu. `), 'Kør kommandoen i terminalen, så kommer beløbene her. Uden --yes viser den bare, hvad den vil skrive.'), h('div', { class: 'ad-cmd' }, h('code', {}, cmd), copyButton(() => cmd, 'kommandoen')))
        : null;
    const waitingLine = v.waitingOre > 0 ? h('p', { class: 'ad-paysum__wait' }, `+ ${formatKr(v.waitingOre)} venter på faktura eller oplysninger`) : null;
    sum.replaceChildren(...[
        head,
        h('p', { class: 'kt-big' }, h('span', { class: 'kt-big__kr' }, formatKr(v.toPayOre)), h('span', { class: 'kt-big__label' }, v.toPayOre > 0 ? 'kan overføres nu' : 'intet at overføre lige nu')),
        waitingLine,
        counts.length || v.done.length ? h('ul', { class: 'ad-paycounts' }, ...counts.map(([s, n]) => h('li', { class: `is-${s}` }, h('b', {}, String(n)), h('span', {}, COUNT_TEXT[s]))), v.done.length ? h('li', { class: 'is-done' }, h('b', {}, String(v.done.length)), h('span', {}, 'færdige')) : null) : null,
        callout,
    ].filter((e) => e !== null));
    const months = reportMonths(state.payouts, new Map(state.payees.map((y) => [y.creator_id, y.kind])), new Map(o.creators.map((c) => [c.id, c.name])), x.today);
    placeGuide(false);
    list.replaceChildren(...v.todo.filter((t) => t.step !== 'report').map((t) => payoutCard(t, x)), ...months.map((m) => skatFlow(m, x, owedMissing.map((w) => firstName(w.c)))));
    placeGuide(true);
    const groups = [];
    if (owedMissing.length || v.missing.length)
        groups.push(payGroup('Mangler oplysninger', v.missing.length, v.missing.map(({ c, dueOre }) => {
            const write = c.email ? h('a', { class: 'ad-mail', href: dueOre > 0 ? mailTo(c, dueOre) : `mailto:${c.email}` }, icon(ICONS.mail), `Skriv til ${firstName(c)}`) : null;
            return payLine(c.name, dueOre > 0 ? h('b', { class: 'ad-line__kr' }, formatKr(dueOre)) : chip('Intet til gode', 'muted'), dueOre > 0 ? 'Har penge til gode, men mangler navn, CPR/CVR og konto. Beløbet venter.' : 'Har ikke skrevet navn, CPR/CVR og konto endnu', write);
        })));
    if (v.rolled.length)
        groups.push(payGroup(`Under ${formatKr(CREATOR_PAY.minPayout * 100)}`, v.rolled.length, v.rolled.map((r) => payLine(r.c?.name ?? 'Ukendt', h('b', { class: 'ad-line__kr is-muted' }, formatKr(r.dueOre)), `For ${monthName(r.p.month, v.month)} · lægges oven i næste udbetaling`))));
    if (v.done.length)
        groups.push(payGroup('Færdige', v.done.length, v.done.map((r) => payLine(r.c?.name ?? 'Ukendt', h('b', { class: 'ad-line__kr' }, formatKr(r.dueOre)), `For ${monthName(r.p.month, v.month)} · overført ${when(r.p.paid_at, v.month)} · ${r.payee?.kind === 'company' ? 'faktura modtaget' : r.p.reported_at ? 'indberettet i eIndkomst' : 'ingen indberetning'}`))));
    more.replaceChildren(...groups);
    byId('ad-payout-empty').hidden = v.todo.length > 0 || v.open || months.length > 0;
    return { n: v.todo.length + owedMissing.length, hot: v.open || v.todo.length > 0 };
}
function renderPot(view) {
    const p = view.pot;
    const pct = (ore) => `${Math.min(100, Math.round((ore / Math.max(1, p.potOre)) * 1000) / 10)}%`;
    const subs = h('i', { class: 'ad-bar__subs' });
    subs.style.width = pct(p.subsOre);
    const views = h('i', { class: 'ad-bar__views' });
    views.style.width = pct(Math.max(0, p.usedOre - p.subsOre));
    const scaled = p.ppm < PPM;
    byId('ad-pot').replaceChildren(h('div', { class: 'kt-head' }, h('h2', { id: 'ad-pot-h' }, `Puljen i ${monthName(p.month, p.month)}`), chip(scaled ? `Visninger betales med ${formatPercent(p.ppm)}` : 'Foreløbig', scaled ? 'wait' : '')), h('p', { class: 'kt-big' }, h('span', { class: 'kt-big__kr' }, formatKr(p.usedOre)), h('span', { class: 'kt-big__label' }, `af ${formatKr(p.potOre)} brugt`)), h('div', { class: 'ad-bar', role: 'img', 'aria-label': `Abonnenter ${formatKr(p.subsOre)}, visninger ${formatKr(Math.max(0, p.usedOre - p.subsOre))}, af ${formatKr(p.potOre)}` }, subs, views), h('ul', { class: 'ad-legend' }, h('li', {}, h('i', { class: 'ad-dot ad-dot--subs' }), h('span', {}, 'Abonnenter'), h('b', {}, formatKr(p.subsOre))), h('li', {}, h('i', { class: 'ad-dot ad-dot--views' }), h('span', {}, scaled ? `Visninger (${formatKr(p.viewsOre)} før puljen)` : 'Visninger'), h('b', {}, formatKr(Math.max(0, p.usedOre - p.subsOre)))), h('li', {}, h('i', { class: 'ad-dot' }), h('span', {}, 'Tilbage'), h('b', {}, formatKr(Math.max(0, p.potOre - p.usedOre))))), h('p', { class: 'kt-note' }, `Abonnent-bonus betales altid fuldt. Visninger fra talte videoer i ${monthName(p.month, p.month)}${p.notCounted ? `; ${p.notCounted} ${p.notCounted === 1 ? 'video' : 'videoer'} fra måneden er ikke talt endnu og er ikke med` : ''}. Puljen er ${formatKr(CREATOR_POT_KR * 100)} om måneden.`));
}
function renderCreators(view) {
    const rows = view.creators.map((l) => {
        const s = l.c.stats;
        const subsText = s ? [`${formatInt(s.trials)} ${s.trials === 1 ? 'prøve' : 'prøver'}`, s.pending ? `${formatInt(s.pending)} mangler 2. betaling` : null].filter(Boolean).join(' · ') : 'ikke talt endnu';
        const paidText = l.paidOre > 0 ? `${formatKr(l.paidOre)} udbetalt` : 'intet udbetalt endnu';
        return h('tr', { role: 'row' }, h('td', { class: 'ad-c', role: 'cell' }, h('div', { class: 'ad-who' }, h('span', { class: 'ad-avatar', 'aria-hidden': 'true' }, (l.c.name.trim()[0] ?? '?').toUpperCase()), h('span', { class: 'ad-c__text' }, h('b', {}, l.c.name, l.c.code ? h('span', { class: 'ad-code ad-code--inline' }, l.c.code) : null), sub([l.c.tiktok, l.c.instagram].filter(Boolean).join(' · ') || 'Ingen profiler')), l.c.status !== 'active' ? chip(l.c.status === 'paused' ? 'På pause' : 'Stoppet', 'muted') : null)), h('td', { class: 'ad-kode', role: 'cell', 'data-k': 'Kode' }, l.c.code ? h('span', { class: 'ad-code' }, l.c.code) : '–', sub(`${formatInt(l.c.code_uses)} har brugt den`)), h('td', { class: 'num', role: 'cell', 'data-k': 'Videoer' }, formatInt(l.videos), l.waiting ? sub(`${l.waiting} venter på dig`, 'ad-waiting') : null), h('td', { class: 'num', role: 'cell', 'data-k': 'Abonnenter' }, s ? formatInt(s.kept) : '–', sub(subsText, 'ad-desk')), h('td', { class: 'num', role: 'cell', 'data-k': 'Optjent i alt' }, formatKr(l.earnedOre)), h('td', { class: 'num ad-paid', role: 'cell', 'data-k': 'Udbetalt' }, l.paidOre > 0 ? formatKr(l.paidOre) : '–'), h('td', { class: 'ad-more', role: 'cell' }, `Abonnenter: ${subsText}. ${paidText[0].toUpperCase()}${paidText.slice(1)}.`));
    });
    byId('ad-creators-empty').hidden = rows.length > 0;
    byId('ad-creators-list').replaceChildren(h('table', { class: 'kt-table ad-ctable', role: 'table' }, h('caption', { class: 'sr-only' }, 'Creators: kode, videoer, abonnenter, optjent og udbetalt'), h('thead', { role: 'rowgroup' }, h('tr', { role: 'row' }, ...['Creator', 'Kode', 'Videoer', 'Abonnenter', 'Optjent i alt', 'Udbetalt'].map((t, i) => h('th', { scope: 'col', role: 'columnheader', class: i >= 2 ? 'num' : '' }, t)))), h('tbody', { role: 'rowgroup' }, ...rows)));
}
function renderStats(view) {
    const item = (n, label, hot, tab) => {
        const b = h('button', { class: `ad-stat${hot ? ' is-hot' : ''}`, type: 'button' }, h('b', {}, n), h('span', {}, label));
        b.addEventListener('click', () => selectTab(tab, true));
        return h('li', {}, b);
    };
    byId('ad-stats').replaceChildren(item(formatKr(view.pot.usedOre), `af ${formatKr(view.pot.potOre)} brugt i ${monthName(view.month, view.month)}`, false, 'creators'));
}
let selectTab = () => undefined;
let currentTab = 'review';
function revealTab() {
    const chosen = byId(`ad-tab-${currentTab}`);
    const bar = chosen.parentElement;
    if (!bar || bar.scrollWidth <= bar.clientWidth)
        return;
    const left = chosen.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft - 16;
    bar.scrollLeft = Math.max(0, left);
}
function startTabs(initial) {
    const tabs = TAB_SLUGS.map(([t]) => t);
    selectTab = (t, focus = false) => {
        for (const x of tabs) {
            const b = byId(`ad-tab-${x}`);
            b.setAttribute('aria-selected', String(x === t));
            b.tabIndex = x === t ? 0 : -1;
            byId(`ad-${x}`).hidden = x !== t;
        }
        if (focus)
            byId(`ad-tab-${t}`).focus();
        currentTab = t;
        revealTab();
        const slug = TAB_SLUGS.find(([x]) => x === t)?.[1] ?? '';
        try {
            history.replaceState(null, '', `${location.pathname}${location.search}${t === 'review' ? '' : `#${slug}`}`);
        }
        catch {
        }
    };
    tabs.forEach((t, i) => {
        const b = byId(`ad-tab-${t}`);
        b.addEventListener('click', () => selectTab(t));
        b.addEventListener('keydown', (e) => {
            const k = e.key;
            const next = k === 'ArrowRight' ? tabs[(i + 1) % tabs.length] : k === 'ArrowLeft' ? tabs[(i - 1 + tabs.length) % tabs.length] : k === 'Home' ? tabs[0] : k === 'End' ? tabs[tabs.length - 1] : null;
            if (next) {
                e.preventDefault();
                selectTab(next, true);
            }
        });
    });
    window.addEventListener('hashchange', () => {
        const t = TAB_SLUGS.find(([, s]) => s === location.hash.replace(/^#/, ''))?.[0];
        if (t)
            selectTab(t);
    });
    selectTab(initial);
}
function render(x) {
    const v = x.view;
    renderStats(v);
    const pay = renderPayouts(x.overview, x.payouts, x.now, { backend: x.backend, month: v.month, today: v.today, done: x.done });
    const counts = { review: v.review.length, count: v.count.length, posted: v.approved.length + v.posted.length, payout: pay.n, creators: v.creators.length, history: v.history.length };
    for (const [t, n] of Object.entries(counts)) {
        const b = byId(`ad-n-${t}`);
        b.textContent = String(n);
        b.classList.toggle('is-hot', ((t === 'review' || t === 'count') && n > 0) || (t === 'payout' && pay.hot));
    }
    byId('ad-review-list').replaceChildren(...v.review.map((r) => reviewCard(r, x)));
    byId('ad-review-empty').hidden = v.review.length > 0;
    byId('ad-count-list').replaceChildren(...v.count.map((r) => countCard(r, x)));
    byId('ad-count-empty').hidden = v.count.length > 0;
    byId('ad-posted-list').replaceChildren(...postedPanel(x));
    byId('ad-posted-empty').hidden = v.approved.length + v.posted.length > 0;
    byId('ad-history-list').replaceChildren(...historyPanel(x));
    byId('ad-history-empty').hidden = v.history.length > 0;
    renderPot(v);
    renderCreators(v);
    void attachVideos(x.backend);
    requestAnimationFrame(revealTab);
}
async function attachVideos(backend) {
    const els = [...document.querySelectorAll('video[data-path]')].filter((el) => !el.src);
    if (!els.length)
        return;
    const urls = await backend.signed([...new Set(els.map((el) => el.dataset.path ?? ''))]).catch(() => new Map());
    for (const el of els) {
        const url = urls.get(el.dataset.path ?? '');
        if (url)
            el.src = `${url}#t=0.5`;
        else
            el.closest('.ad-media')?.classList.add('is-broken');
    }
}
function startAdmin() {
    const demo = demoMode(location.search, location.hostname);
    const logout = byId('ad-logout');
    const slug = location.hash.replace(/^#/, '');
    const initial = TAB_SLUGS.find(([, s]) => s === slug)?.[0] ?? 'review';
    let overview = null;
    let payouts = 'off';
    let now = Date.now();
    let backend = null;
    const flash = (text) => {
        say(byId('ad-flash'), 'ok', text);
    };
    const show = () => {
        if (!overview || !backend)
            return;
        render({ view: adminView(withPayoutStatus(overview, typeof payouts === 'string' ? null : payouts), now), overview, payouts, now, backend, done });
    };
    let reload = async () => undefined;
    const done = async (said) => {
        await reload();
        show();
        flash(said);
    };
    startTabs(initial);
    matchMedia(NARROW).addEventListener('change', () => placeGuide(true));
    if (demo !== null) {
        byId('pt-demo').hidden = false;
        logout.hidden = false;
        byId('ad-me').textContent = 'admin@eksempel.dk';
        logout.addEventListener('click', () => location.assign(LOGIN_PATH + '?demo=ud'));
        byId('ad-retry').addEventListener('click', () => location.reload());
        window.setTimeout(() => {
            if (demo === 'fejl')
                return adState('error');
            if (demo === 'ikke') {
                byId('ad-none-email').textContent = 'maja@eksempel.dk';
                return adState('none');
            }
            overview = adminDemo(now, demo);
            const o = overview;
            const pd = adminPayoutDemo(now, demo, o);
            payouts = pd;
            const find = (id) => o.videos.find((v) => v.id === id);
            backend = {
                signed: async (paths) => new Map(paths.map((p, i) => [p, DEMO_CLIPS[i % DEMO_CLIPS.length]])),
                call: async (fn, args) => {
                    await new Promise((r) => setTimeout(r, 250));
                    if (fn === 'creator_admin_payee') {
                        const y = DEMO_PAYEES[String(args.who)];
                        return y ? { data: y, error: null } : { data: null, error: refusalText('creator:no_details') };
                    }
                    const p = pd.payouts.find((r) => r.id === args.payout_id);
                    if (!p)
                        return { data: null, error: refusalText('creator:payout_moved') };
                    const kind = pd.payees.find((y) => y.creator_id === p.creator_id)?.kind ?? null;
                    const iso = new Date(now).toISOString();
                    if (fn === 'creator_admin_mark_paid') {
                        if (p.status !== 'pending')
                            return { data: null, error: refusalText('creator:payout_moved') };
                        if (!kind)
                            return { data: null, error: refusalText('creator:no_details') };
                        if (kind === 'company' && !p.invoice_at)
                            return { data: null, error: refusalText('creator:need_invoice') };
                        Object.assign(p, { status: 'paid', paid_at: iso });
                    }
                    if (fn === 'creator_admin_mark_filed') {
                        if (kind === 'person' && p.status !== 'paid')
                            return { data: null, error: refusalText('creator:not_paid') };
                        if (kind === 'person')
                            Object.assign(p, { reported_at: iso });
                        else
                            Object.assign(p, { invoice_at: iso });
                    }
                    const c = o.creators.find((x) => x.id === p.creator_id);
                    if (c)
                        c.payouts = c.payouts.map((r) => (r.month === p.month ? { ...r, paid_at: p.paid_at } : r));
                    return { data: null, error: null };
                },
                rpc: async (fn, args) => {
                    await new Promise((r) => setTimeout(r, 250));
                    const v = find(args.video_id);
                    if (!v)
                        return refusalText('creator:wrong_state');
                    const iso = new Date(now).toISOString();
                    if (fn === 'creator_admin_decide')
                        Object.assign(v, { state: args.approve ? 'approved' : 'declined', note: args.reason ?? null, decided_at: iso, closed_at: args.approve ? null : iso });
                    if (fn === 'creator_admin_count') {
                        if (args.seen_stats_at !== v.stats_sent_at)
                            return refusalText('creator:stats_changed');
                        Object.assign(v, { state: 'counted', tiktok_public_views: args.tiktok_public ?? null, instagram_public_views: args.instagram_public ?? null, counted_at: iso, closed_at: iso });
                    }
                    if (fn === 'creator_admin_reject')
                        Object.assign(v, { state: 'rejected', rejected: true, note: args.reason, closed_at: iso });
                    return null;
                },
            };
            show();
            adState('dash');
        }, 400);
        return;
    }
    const bad = linkError(location.hash, location.search);
    if (bad)
        return location.replace(`${LOGIN_PATH}?fejl=${bad === 'expired' ? 'udloebet' : 'link'}`);
    const client = portalClient();
    if (!client)
        return adState('error');
    logout.addEventListener('click', async () => {
        logout.disabled = true;
        await client.auth.signOut().catch(() => undefined);
        location.replace(LOGIN_PATH + '?ud=1');
    });
    backend = {
        rpc: async (fn, args) => {
            const { error } = await client.rpc(fn, args);
            return error ? refusalText(error.message) : null;
        },
        call: async (fn, args) => {
            const { data, error } = await client.rpc(fn, args);
            return { data, error: error ? refusalText(error.message) : null };
        },
        signed: async (paths) => {
            const { data, error } = await client.storage.from(UPLOAD_BUCKET).createSignedUrls(paths, 3600);
            if (error || !data)
                return new Map();
            return new Map(data.flatMap((d) => (d.path && d.signedUrl ? [[d.path, d.signedUrl]] : [])));
        },
    };
    const fetchOverview = async () => {
        const { data: session } = await client.auth.getSession();
        if (!session.session) {
            location.replace(LOGIN_PATH);
            return false;
        }
        logout.hidden = false;
        byId('ad-me').textContent = session.session.user.email ?? '';
        const { data, error } = await client.rpc('creator_admin_overview');
        if (error) {
            if (/creator:not_admin/.test(error.message)) {
                byId('ad-none-email').textContent = session.session.user.email ?? '';
                adState('none');
                return false;
            }
            if (/jwt|token|401|not authenticated/i.test(`${error.code} ${error.message}`)) {
                await client.auth.signOut().catch(() => undefined);
                location.replace(LOGIN_PATH);
                return false;
            }
            throw new Error(error.message);
        }
        const o = parseOverview(data);
        if (!o)
            throw new Error('not an overview');
        overview = o;
        const pay = await client.rpc('creator_admin_payouts');
        payouts = pay.error ? (notThereYet(`${pay.error.code} ${pay.error.message}`) ? 'off' : 'error') : (parsePayouts(pay.data) ?? 'error');
        const serverNow = Date.parse(o.now);
        now = Number.isFinite(serverNow) ? serverNow : Date.now();
        return true;
    };
    reload = async () => {
        await fetchOverview().catch(() => undefined);
    };
    const load = async () => {
        adState('loading');
        try {
            if (await fetchOverview()) {
                show();
                adState('dash');
            }
        }
        catch {
            adState('error');
        }
    };
    byId('ad-retry').addEventListener('click', () => void load());
    void load();
}
startAdmin();
})();
