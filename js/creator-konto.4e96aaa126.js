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

// scripts/site/creator/konto.ts
const CONTACT = 'kontakt@prepnow.dk';
const setView = (v) => {
    byId('indhold').dataset.state = v;
};
const nextMonth = (m) => {
    const [y, mo] = m.split('-').map(Number);
    return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
};
const daysBefore = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 86400000).toISOString().slice(0, 10);
const who = (p) => (p.platform === 'tiktok' ? 'seere' : 'konti nået');
function numberLines(v) {
    const ps = v.platforms.filter((p) => p.basis !== null && p.viewers !== null);
    const line = (p, name) => `${name ? `${PLATFORM_NAME[p.platform]}: ` : ''}${formatInt(p.basis ?? 0)} visninger · ${formatInt(p.viewers ?? 0)} ${who(p)}`;
    const reduced = v.state === 'counted' && v.counted < v.views ? `${formatInt(v.counted)} tæller med, højst 2 pr. seer` : '';
    const lower = ps.filter((p) => p.publicViews !== null && p.views !== null && p.publicViews < p.views);
    const lowerLine = lower.map((p) => sub(`Du skrev ${formatInt(p.views ?? 0)}${ps.length > 1 ? ` på ${PLATFORM_NAME[p.platform]}` : ''}, under videoen stod ${formatInt(p.publicViews ?? 0)}. Vi bruger det laveste.`, 'kt-note-line'));
    if (ps.length === 1)
        return [sub(line(ps[0], true), 'kt-desk'), sub(line(ps[0], false) + (reduced ? ` · ${reduced}` : ''), 'kt-phone'), ...lowerLine];
    return [...ps.map((p) => sub(line(p, true))), ...(reduced ? [sub(reduced, 'kt-phone')] : []), ...lowerLine];
}
const fresh = (r, today) => !!r.decided_at && addDays(r.decided_at.slice(0, 10), DRAFT_KEEP_DAYS) >= today;
function videoRow(v, month, today, act) {
    const r = v.row;
    const up = r.posted_on !== null;
    const title = r.title ?? (up ? `Video fra ${shortDate(r.posted_on ?? '', month)}` : 'Din video');
    const counted = v.state === 'counted';
    const reduced = counted && v.counted < v.views;
    const posted = up ? shortDate(r.posted_on ?? '', month) : '';
    const countOn = v.countOn ? shortDate(v.countOn, month) : '';
    const status = creatorStatus(r, today, month, v.views);
    const flags = [chip(status.label, status.kind)];
    if (v.capped)
        flags.push(chip(`Max ${CREATOR_PAY.perVideoCap} kr nået`, 'lime'));
    if (v.scaled)
        flags.push(chip(`Betalt ${formatPercent(Math.round((v.paidOre / v.ore) * 1000000))}, puljen var brugt op`, 'muted'));
    const dispute = h('a', { class: 'kt-sub kt-dispute', href: `mailto:${CONTACT}?subject=${encodeURIComponent(`Min video: ${title}`)}` }, 'Uenig? Skriv til os');
    let button = null;
    if (status.action) {
        const b = h('button', { class: 'btn btn--sm btn--violet kt-rowbtn', type: 'button' }, status.action === 'stats' ? 'Send statistik' : 'Sæt link ind');
        b.addEventListener('click', () => (status.action === 'stats' ? act.stats(r) : act.post(r)));
        button = b;
    }
    else if (r.state === 'declined' && fresh(r, today)) {
        const b = h('button', { class: 'btn btn--sm btn--violet kt-rowbtn', type: 'button' }, 'Upload ny version');
        b.addEventListener('click', () => act.again(r));
        button = b;
    }
    const off = !counted;
    const paid = counted || r.state === 'rejected';
    const phoneDate = up ? (r.state === 'posted' || r.state === 'counting' ? `Lagt op ${posted}` : `Lagt op ${posted} · talt ${countOn}`) : null;
    return h('tr', { class: off ? 'is-off' : '', role: 'row', 'data-state': r.state }, h('td', { class: 'kt-video', role: 'cell' }, h('div', { class: 'kt-v' }, v.platforms.length ? h('div', { class: 'kt-v__plats' }, ...v.platforms.map((p) => platformBadge(p.platform, p.url))) : null, h('span', { class: 'kt-v__title' }, title), phoneDate ? sub(phoneDate, 'kt-phone') : null, ...(counted || v.state === 'rejected' ? numberLines(v) : []), h('div', { class: 'kt-flags' }, ...flags), status.detail ? sub(status.detail, r.state === 'declined' || r.state === 'rejected' ? 'kt-note-line' : '') : null, r.state === 'posted' && !status.action ? sub(`Udbetales i starten af ${monthName(nextMonth(r.month ?? month), month)}.`) : null, button, r.state === 'declined' || r.state === 'rejected' ? dispute : null)), h('td', { class: 'kt-date', role: 'cell' }, ...(up ? [posted, r.state === 'counted' || r.state === 'rejected' ? sub(`talt ${countOn}`) : null] : [h('span', { class: 'sr-only' }, 'ikke lagt op endnu')])), ...(paid
        ? [
            h('td', { class: 'num', role: 'cell' }, formatInt(v.views)),
            h('td', { class: 'num', role: 'cell' }, ...(counted ? [formatInt(v.counted)] : none('tæller ikke')), reduced ? sub('højst 2 pr. seer') : null),
            h('td', { class: 'num kt-kr', role: 'cell' }, counted ? formatKr(v.paidOre) : '0 kr'),
        ]
        : [h('td', { class: 'kt-later', role: 'cell', colspan: '3' }, up ? 'tælles senere' : h('span', { class: 'sr-only' }, 'ikke talt endnu'))]));
}
function renderMoney(s, videos) {
    const m = s.thisMonth;
    const name = monthName(s.month, s.month);
    const fresh = s.earnedOre === 0 && videos === 0;
    byId('kt-money-main').hidden = fresh;
    byId('kt-start').hidden = !fresh;
    byId('kt-month-chip').replaceChildren(fresh ? '' : chip(m.settled ? (m.paidAt ? 'Udbetalt' : 'Endeligt beløb') : 'Foreløbigt', m.settled ? 'lime' : ''));
    byId('kt-month-kr').textContent = formatKr(m.amountOre);
    byId('kt-month-label').textContent = m.settled ? `for ${name}` : `for ${name} indtil nu`;
    const subs = m.subscribers;
    byId('kt-split').replaceChildren(h('li', {}, h('span', {}, 'Fra visninger'), h('b', {}, formatKr(m.viewsOre))), h('li', {}, h('span', {}, subs ? `Fra ${subs} ${subs === 1 ? 'ny abonnent' : 'nye abonnenter'}` : 'Fra abonnenter'), h('b', {}, formatKr(m.subsOre))));
    const thisMonthDue = m.paidAt ? 0 : m.amountOre;
    const pair = (dt, dd, cls = '') => h('div', cls ? { class: cls } : {}, h('dt', {}, dt), h('dd', {}, dd));
    byId('kt-sum').replaceChildren(pair('Optjent i alt', formatKr(s.earnedOre)), pair('Udbetalt', formatKr(s.paidOre)), ...(s.outstandingOre !== thisMonthDue ? [pair('På vej til dig', formatKr(s.outstandingOre), 'is-due')] : []));
    const next = monthName(nextMonth(s.month), s.month);
    byId('kt-money-note').textContent = fresh
        ? 'Du kan se dine penge her, så snart vi har talt din første video.'
        : !m.settled && m.amountOre > 0
            ? `Beløbet er foreløbigt. Det kan blive lavere, hvis månedens pulje bliver brugt op. Vi udbetaler det i starten af ${next}.`
            : s.earnedOre === 0
                ? `Dine første penge står her, når vi har talt din første video. Vi tæller ${CREATOR_COUNT_DAYS} dage efter, at den er lagt op.`
                : 'Vi betaler i starten af hver måned for måneden før.';
}
function renderFunnel(s, code) {
    const f = s.funnel;
    const per = CREATOR_PAY.perSubscriber;
    const steps = [
        ['Brugte din kode', f.uses, ''],
        ['Startede en prøveperiode', f.trials, ''],
        ['Begyndte at betale', f.paying, ''],
        ['Har betalt 2 gange', f.kept, 'is-kept'],
    ];
    const empty = f.uses === 0 && f.kept === 0;
    byId('kt-funnel-empty').hidden = !empty;
    byId('kt-funnel-empty').textContent = `Ingen har brugt din kode endnu. Sig den i dine videoer: seerne skriver ${code ?? 'koden'} i appen under Konto, og så ser du dem her med det samme. Du får ${per} kr for hver ny abonnent, ${CREATOR_SUBSCRIBER_RULE}.`;
    const size = (n) => (n === null ? (empty ? 0 : SMALL_COUNT / 2) : n);
    const top = Math.max(1, ...steps.map((x) => size(x[1])));
    byId('kt-steps').classList.toggle('is-empty', empty);
    byId('kt-steps').replaceChildren(...steps.map(([label, n, cls]) => {
        const bar = h('i');
        bar.style.setProperty('--w', `${Math.round((size(n) / top) * 100)}%`);
        const shown = n === null ? (empty ? '0' : `under ${SMALL_COUNT}`) : formatInt(n);
        return h('li', { class: `kt-step ${cls}${size(n) === 0 ? ' is-zero' : ''}${n === null && !empty ? ' is-few' : ''}` }, h('span', { class: 'kt-step__label' }, label), h('b', {}, shown), h('span', { class: 'kt-bar', 'aria-hidden': 'true' }, bar));
    }));
    const few = !empty && steps.some((x) => x[1] === null);
    byId('kt-funnel-chip').replaceChildren(f.kept ? chip(`${formatInt(f.kept)} × ${per} kr = ${formatKr(f.kept * per * 100)} i alt`, 'lime') : chip(`${per} kr pr. ny abonnent`));
    const news = [];
    if (f.usesThisMonth)
        news.push(`${formatInt(f.usesThisMonth)} brugte koden i ${monthName(s.month, s.month)}`);
    if (f.pending)
        news.push(`${formatInt(f.pending)} venter på 2. betaling`);
    if (f.lost)
        news.push(`${formatInt(f.lost)} stoppede`);
    byId('kt-funnel-news').replaceChildren(h('span', { class: 'kt-news__items' }, ...news.map((x) => h('span', {}, x))));
    byId('kt-funnel-news').hidden = news.length === 0 || empty;
    byId('kt-funnel-note').textContent =
        (f.updatedAt
            ? `Tallene er siden din start. Brug af koden ser du med det samme, resten tæller vi hver uge (sidst ${shortDate(f.updatedAt.slice(0, 10), s.month)}).`
            : 'Tallene er siden din start. Brug af koden ser du med det samme, prøveperioder og betalinger tæller vi hver uge.') +
            (few ? ` Er et tal under ${SMALL_COUNT}, viser vi det ikke, så ingen kan regne ud, hvem der har købt.` : '');
}
function renderVideos(s, today, act) {
    const n = s.videos.length;
    byId('kt-videos-chip').replaceChildren(n ? chip(n === 1 ? '1 video' : `${n} videoer`) : '');
    const todo = (v) => (v.row.state === 'approved' && (postDeadline(v.row) ?? today) >= today) || statsReady(v.row, today) || (v.row.state === 'declined' && fresh(v.row, today));
    const ordered = [...s.videos.filter(todo), ...s.videos.filter((v) => !todo(v))];
    byId('kt-video-rows').replaceChildren(...ordered.map((v) => videoRow(v, s.month, today, act)));
    byId('kt-videos-table').hidden = n === 0;
    byId('kt-videos-empty').hidden = n > 0;
    const ready = s.videos.filter((v) => statsReady(v.row, today));
    const stats = byId('kt-stats-open');
    stats.disabled = ready.length === 0;
    const soon = s.videos
        .filter((v) => v.row.state === 'posted' && v.countOn && v.countOn > today)
        .map((v) => v.countOn ?? '')
        .sort()[0];
    byId('kt-stats-hint').textContent = ready.length
        ? ready.length === 1
            ? '1 video er klar til statistik.'
            : `${ready.length} videoer er klar til statistik.`
        : soon
            ? `Fra ${shortDate(soon, s.month)} kan du sende statistik for den næste.`
            : `Du sender statistik ${CREATOR_COUNT_DAYS} dage efter, at en video er lagt op.`;
}
function renderPayouts(s, info) {
    const rows = s.months.filter((m) => m.settled || (m.amountOre > 0 && m.month < s.month)).slice(0, 12);
    const noDetails = info !== 'off' && info.payee === null;
    const min = formatKr(CREATOR_PAY.minPayout * 100);
    const day = (iso) => shortDate(copenhagenDay(Date.parse(iso)), s.month);
    byId('kt-payout-list').replaceChildren(...rows.map((m) => {
        const [label, kind, line] = m.rolled
            ? [`Under ${min}`, 'muted', m.paidAt ? `Betalt med ${monthName(m.paidWith ?? m.month, s.month)} ${day(m.paidAt)}` : m.paidWith ? `Kommer med ${monthName(m.paidWith, s.month)}` : 'Lægges oven i næste måned']
            : m.paidAt
                ? ['Betalt', 'lime', `Overført ${day(m.paidAt)}`]
                : m.settled
                    ? ['Afventer', 'wait', noDetails ? 'Venter på dine oplysninger' : `Overføres i starten af ${monthName(nextMonth(m.month), s.month)}`]
                    : ['Gøres op', '', `Udbetales i starten af ${monthName(nextMonth(m.month), s.month)}`];
        const carried = m.carriedOre > 0 ? ` · med ${formatKr(m.carriedOre)} fra tidligere` : '';
        const scaled = m.settled && m.ppm < 1000000 ? ` · visninger betalt med ${formatPercent(m.ppm)}, fordi puljen var brugt op` : '';
        return h('li', { class: m.rolled ? 'is-rolled' : '' }, h('span', {}, monthName(m.month, s.month)), h('b', {}, formatKr(m.amountOre + m.carriedOre)), chip(label, kind), h('small', {}, line + carried + scaled));
    }));
    byId('kt-payout-list').hidden = rows.length === 0;
    byId('kt-payouts-empty').hidden = rows.length > 0;
}
function renderHero(d) {
    const first = d.creator.name.trim().split(/\s+/)[0];
    byId('kt-title').textContent = first ? `Hej, ${first}` : 'Din creator-konto';
    document.title = `${d.creator.name || 'Creator-konto'} · PrepNow`;
    const code = d.creator.code;
    byId('kt-code-box').hidden = !code;
    byId('kt-code-hint').hidden = !code;
    if (code)
        byId('kt-code').textContent = code;
    byId('kt-admin-link').hidden = d.admin !== true;
}
function startForms(getData, backend, reload) {
    const up = sheet(byId('kt-up'), () => resetUp());
    const upForm = byId('kt-up-form');
    const upFile = filePicker(byId('kt-up-file'), byId('kt-up-file-name'), byId('kt-up-file-meta'), byId('kt-up-file-msg'), { name: 'Vælg din video', meta: `mp4 eller mov, højst ${UPLOAD_MAX_MB}\u00a0MB` }, 'video');
    const upMsg = byId('kt-up-msg');
    const upBar = byId('kt-up-progress');
    const upSend = byId('kt-up-send');
    const resetUp = () => {
        upForm.reset();
        upFile.reset();
        say(upMsg, null);
        progress(upBar, null);
        upSend.disabled = false;
    };
    byId('kt-up-open').addEventListener('click', () => up.open());
    upForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ctx = getData();
        const file = upFile.get();
        if (!file)
            return say(byId('kt-up-file-msg'), 'error', 'Vælg videoen først.');
        const type = uploadType(file);
        if (!ctx?.d.folder || !type)
            return say(upMsg, 'error', 'Noget gik galt. Opdatér siden, og prøv igen.');
        up.setBusy(true);
        upSend.disabled = true;
        say(upMsg, null);
        progress(upBar, 0);
        try {
            const path = await backend.reserve(type);
            const failed = await backend.upload(path, file, type, (x) => progress(upBar, x));
            if (failed)
                throw new Error(failed);
            const refused = await backend.rpc('creator_submit_draft', { upload_path: path, video_title: byId('kt-up-title').value.trim() || null, video_note: byId('kt-up-note').value.trim() || null });
            if (refused)
                throw new Error(refused);
            up.setBusy(false);
            up.close();
            await reload();
            flash('Tak! Vi har fået din video og svarer her på siden.');
        }
        catch (err) {
            progress(upBar, null);
            say(upMsg, 'error', err instanceof Error ? err.message : 'Noget gik galt. Prøv igen.');
            upSend.disabled = false;
        }
        finally {
            up.setBusy(false);
        }
    });
    let linkRow = null;
    const link = sheet(byId('kt-link'), () => {
        byId('kt-link-form').reset();
        say(byId('kt-link-msg'), null);
    });
    const linkSend = byId('kt-link-send');
    const dayInput = byId('kt-link-day');
    const dayChips = [...document.querySelectorAll('#kt-link .kt-daychip')];
    const markDay = () => {
        for (const b of dayChips)
            b.setAttribute('aria-pressed', String(b.dataset.iso === dayInput.value));
    };
    for (const b of dayChips) {
        b.addEventListener('click', () => {
            dayInput.value = b.dataset.iso ?? '';
            markDay();
        });
    }
    dayInput.addEventListener('input', markDay);
    const openLink = (r) => {
        const ctx = getData();
        if (!ctx)
            return;
        linkRow = r;
        byId('kt-link-video').textContent = r.title ?? 'Din video';
        const range = postedRange(r, ctx.today);
        const day = byId('kt-link-day');
        day.min = range.min;
        day.max = range.max;
        day.value = r.posted_on ?? '';
        for (const b of dayChips) {
            const iso = daysBefore(ctx.today, Number(b.dataset.day));
            b.dataset.iso = iso;
            b.hidden = iso < range.min || iso > range.max;
        }
        markDay();
        byId('kt-link-tt').value = r.tiktok_url ?? '';
        byId('kt-link-ig').value = r.instagram_url ?? '';
        link.open();
    };
    byId('kt-link-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const msg = byId('kt-link-msg');
        const ttRaw = byId('kt-link-tt').value.trim();
        const igRaw = byId('kt-link-ig').value.trim();
        const tt = ttRaw ? videoLink(ttRaw, 'tiktok') : null;
        const ig = igRaw ? videoLink(igRaw, 'instagram') : null;
        if (!ttRaw && !igRaw)
            return say(msg, 'error', 'Sæt mindst ét link ind: TikTok eller Instagram.');
        if ((ttRaw && isShortLink(ttRaw)) || (igRaw && isShortLink(igRaw)))
            return say(msg, 'error', SHORT_LINK_TEXT);
        if (ttRaw && !tt)
            return say(msg, 'error', 'TikTok-linket virker ikke. Tryk på "Del" under videoen i TikTok, og vælg "Kopiér link".');
        if (igRaw && !ig)
            return say(msg, 'error', 'Instagram-linket virker ikke. Tryk på pilen under videoen i Instagram, og vælg "Kopiér link".');
        const day = byId('kt-link-day');
        if (!day.value || (day.min && day.value < day.min) || (day.max && day.value > day.max))
            return say(msg, 'error', 'Vælg den dag, videoen kom op. Den skal være efter vores ok og senest i dag.');
        if (!linkRow)
            return;
        linkSend.disabled = true;
        link.setBusy(true);
        try {
            const refused = await backend.rpc('creator_mark_posted', { video_id: linkRow.id, tiktok_link: tt, instagram_link: ig, posted_day: day.value });
            if (refused)
                throw new Error(refused);
            link.setBusy(false);
            link.close();
            await reload();
            flash(`Linket er gemt. Du kan sende statistik ${CREATOR_COUNT_DAYS} dage efter, at videoen kom op.`);
        }
        catch (err) {
            say(msg, 'error', err instanceof Error ? err.message : 'Noget gik galt. Prøv igen.');
        }
        finally {
            link.setBusy(false);
            linkSend.disabled = false;
        }
    });
    const stats = sheet(byId('kt-stats'), () => resetStats());
    const statsForm = byId('kt-stats-form');
    const statsFile = filePicker(byId('kt-stats-file'), byId('kt-stats-file-name'), byId('kt-stats-file-meta'), byId('kt-stats-file-msg'), { name: 'Vælg optagelsen', meta: 'En video, ikke et skærmbillede' }, 'optagelse');
    const statsMsg = byId('kt-stats-msg');
    const statsBar = byId('kt-stats-progress');
    const statsSend = byId('kt-stats-send');
    const select = byId('kt-stats-video');
    let ready = [];
    const resetStats = () => {
        statsForm.reset();
        statsFile.reset();
        say(statsMsg, null);
        progress(statsBar, null);
        statsSend.disabled = false;
    };
    const current = () => ready.find((r) => r.id === select.value) ?? null;
    const showPlatforms = () => {
        const r = current();
        for (const p of ['tiktok', 'instagram']) {
            const on = !!r && (p === 'tiktok' ? r.tiktok_url : r.instagram_url) !== null;
            byId(`kt-stats-${p}`).hidden = !on;
            for (const input of byId(`kt-stats-${p}`).querySelectorAll('input'))
                input.required = on;
        }
    };
    select.addEventListener('change', showPlatforms);
    const openStats = (r) => {
        const ctx = getData();
        if (!ctx)
            return;
        ready = ctx.d.videos.filter((v) => statsReady(v, ctx.today));
        if (!ready.length)
            return;
        select.replaceChildren(...ready.map((v) => h('option', { value: v.id }, `${v.title ?? 'Video'} · lagt op ${shortDate(v.posted_on ?? '', ctx.today.slice(0, 7))}`)));
        select.value = (r ?? ready[0]).id;
        byId('kt-stats-pick').hidden = ready.length < 2;
        byId('kt-stats-for').hidden = ready.length > 1;
        byId('kt-stats-one').textContent = (r ?? ready[0]).title ?? 'Din video';
        showPlatforms();
        stats.open();
    };
    byId('kt-stats-open').addEventListener('click', () => openStats());
    statsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ctx = getData();
        const r = current();
        if (!ctx?.d.folder || !r)
            return;
        const file = statsFile.get();
        if (!file)
            return say(byId('kt-stats-file-msg'), 'error', 'Vælg skærmoptagelsen først. Et skærmbillede er ikke nok: vi skal se, at tallene hører til videoen.');
        const numbers = { tiktok_count: null, tiktok_people: null, instagram_count: null, instagram_people: null };
        for (const p of ['tiktok', 'instagram']) {
            if ((p === 'tiktok' ? r.tiktok_url : r.instagram_url) === null)
                continue;
            const views = typedCount(byId(`kt-stats-${p}-views`).value);
            const people = typedCount(byId(`kt-stats-${p}-people`).value);
            if (views === null || people === null)
                return say(statsMsg, 'error', `Skriv visninger og ${VIEWERS_WORD[p].toLowerCase()} for ${PLATFORM_NAME[p]} som hele tal, fx 12400.`);
            if (people > views)
                return say(statsMsg, 'error', `${PLATFORM_NAME[p]}: ${VIEWERS_WORD[p].toLowerCase()} kan ikke være flere end visninger. Tjek tallene i appen.`);
            numbers[`${p}_count`] = views;
            numbers[`${p}_people`] = people;
        }
        const type = uploadType(file);
        if (!type)
            return;
        stats.setBusy(true);
        statsSend.disabled = true;
        say(statsMsg, null);
        progress(statsBar, 0);
        try {
            const path = await backend.reserve(type);
            const failed = await backend.upload(path, file, type, (x) => progress(statsBar, x));
            if (failed)
                throw new Error(failed);
            const refused = await backend.rpc('creator_send_stats', { video_id: r.id, upload_path: path, ...numbers });
            if (refused)
                throw new Error(refused);
            stats.setBusy(false);
            stats.close();
            await reload();
            flash('Tak! Vi tjekker dine tal mod videoen og giver besked her.');
        }
        catch (err) {
            progress(statsBar, null);
            say(statsMsg, 'error', err instanceof Error ? err.message : 'Noget gik galt. Prøv igen.');
            statsSend.disabled = false;
        }
        finally {
            stats.setBusy(false);
        }
    });
    const openUp = (title) => {
        up.open();
        if (title)
            byId('kt-up-title').value = title;
    };
    return { openLink, openStats, upFile, statsFile, openUp };
}
function renderPayee(info, s, editing) {
    const off = info === 'off';
    const y = off ? null : info.payee;
    byId('kt-payee').hidden = off;
    const waiting = s.months.filter((m) => m.settled && !m.paidAt && !m.rolled).reduce((a, m) => a + m.amountOre + m.carriedOre, 0);
    const owed = byId('kt-owed');
    owed.hidden = off || y !== null || waiting === 0;
    owed.replaceChildren(icon(ICONS.info), h('span', {}, h('b', {}, `Du har ${formatKr(waiting)} til gode. `), 'Skriv dine oplysninger herunder, så overfører vi pengene.'));
    byId('kt-payout-chip').replaceChildren(off || !owed.hidden ? '' : y ? chip('Oplysninger gemt', 'lime') : chip('Mangler dine oplysninger', 'wait'));
    if (off)
        return;
    byId('kt-payee-view').hidden = !y || editing;
    byId('kt-payee-form').hidden = !!y && !editing;
    byId('kt-payee-cancel').hidden = !y;
    if (y) {
        const pair = (dt, dd, cls = '') => h('div', cls ? { class: cls } : {}, h('dt', {}, dt), h('dd', {}, dd));
        byId('kt-payee-list').replaceChildren(pair(y.kind === 'person' ? 'Navn' : 'Virksomhed', y.full_name), pair('Adresse', `${y.address}, ${y.postcode} ${y.city}`, 'is-wide'), pair(KIND_TEXT[y.kind].tax, maskTaxId(y.kind, y.tax_id_last4)), pair('Konto', maskAccount(y.reg_no, y.account_last4)));
        const saved = y.updated_at && Number.isFinite(Date.parse(y.updated_at)) ? copenhagenDay(Date.parse(y.updated_at)) : null;
        byId('kt-payee-saved').replaceChildren(icon(ICONS.lock), h('span', {}, `${saved ? `Gemt ${shortDate(saved, s.month).replace(/\.?$/, '.')} · ` : ''}CPR og konto vises kun med de sidste 4 cifre.`));
    }
    byId('kt-tax-line-text').textContent = TAX_LINE[y ? y.kind : formKind()];
    byId('kt-tax-line-form-text').textContent = TAX_LINE[formKind()];
}
const PAYEE_FIELDS = [['full_name', 'name'], ['address', 'address'], ['postcode', 'postcode'], ['city', 'city'], ['tax_id', 'tax'], ['reg_no', 'reg'], ['account', 'account']];
const formKind = () => (byId('kt-payee-company').checked ? 'company' : 'person');
const payeeInput = (id) => byId(`kt-payee-${id}`);
function payeeLabels(stored) {
    const kind = formKind();
    const t = KIND_TEXT[kind];
    byId('kt-payee-name-label').textContent = t.name;
    byId('kt-payee-name-hint').textContent = kind === 'person' ? 'Som det står i din bank' : 'Som det står på virk.dk';
    payeeInput('name').setAttribute('autocomplete', kind === 'person' ? 'name' : 'organization');
    byId('kt-payee-tax-label').textContent = t.tax;
    const keepTax = stored !== null && stored.kind === kind;
    payeeInput('tax').placeholder = keepTax ? `Gemt: ${maskTaxId(kind, stored.tax_id_last4)}` : kind === 'person' ? 'ddmmåå-xxxx' : '8 cifre';
    byId('kt-payee-tax-hint').textContent = keepTax ? 'Lad feltet stå tomt for at beholde det gemte.' : kind === 'person' ? 'Vi skal bruge det for at indberette pengene til Skattestyrelsen' : 'Så sender du en faktura, og vi indberetter ikke noget';
    payeeInput('account').placeholder = stored ? `Gemt: ••••${stored.account_last4}` : 'Op til 10 cifre';
    byId('kt-payee-account-hint').textContent = stored ? 'Tomt: vi beholder den gemte konto (samme reg.nr.).' : '';
    payeeInput('name').placeholder = kind === 'person' ? 'Fornavn og efternavn' : 'Fx Sofies Køkken ApS';
    byId('kt-tax-line-form-text').textContent = TAX_LINE[kind];
}
function fillPayee(stored) {
    byId(stored?.kind === 'company' ? 'kt-payee-company' : 'kt-payee-person').checked = true;
    payeeInput('name').value = stored?.full_name ?? '';
    payeeInput('address').value = stored?.address ?? '';
    payeeInput('postcode').value = stored?.postcode ?? '';
    payeeInput('city').value = stored?.city ?? '';
    payeeInput('tax').value = '';
    payeeInput('reg').value = stored?.reg_no ?? '';
    payeeInput('account').value = '';
    for (const [, id] of PAYEE_FIELDS)
        showFieldError(id, null);
    payeeLabels(stored);
}
function showFieldError(id, problem) {
    const err = byId(`kt-payee-${id}-err`);
    err.hidden = !problem;
    err.textContent = problem ?? '';
    if (problem)
        payeeInput(id).setAttribute('aria-invalid', 'true');
    else
        payeeInput(id).removeAttribute('aria-invalid');
}
const readPayee = () => ({ kind: formKind(), full_name: payeeInput('name').value, address: payeeInput('address').value, postcode: payeeInput('postcode').value, city: payeeInput('city').value, tax_id: payeeInput('tax').value, reg_no: payeeInput('reg').value, account: payeeInput('account').value });
function startPayee(getInfo, save, saved, setEditing) {
    const form = byId('kt-payee-form');
    const send = byId('kt-payee-save');
    const msg = byId('kt-payee-msg');
    const stored = () => {
        const i = getInfo();
        return i && i !== 'off' ? i.payee : null;
    };
    for (const r of form.querySelectorAll('input[name="kt-payee-kind"]'))
        r.addEventListener('change', () => payeeLabels(stored()));
    for (const [, id] of PAYEE_FIELDS)
        payeeInput(id).addEventListener('input', () => showFieldError(id, null));
    payeeInput('tax').addEventListener('blur', () => {
        const d = digitsOf(payeeInput('tax').value);
        if (formKind() === 'person' && /^\d{10}$/.test(d))
            payeeInput('tax').value = formatTaxId('person', d);
    });
    byId('kt-payee-edit').addEventListener('click', () => {
        fillPayee(stored());
        setEditing(true);
        payeeInput('name').focus();
    });
    byId('kt-payee-cancel').addEventListener('click', () => {
        say(msg, null);
        setEditing(false);
        byId('kt-payee-edit').focus();
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = readPayee();
        const problems = payeeProblems(f, stored());
        let first = null;
        for (const [field, id] of PAYEE_FIELDS) {
            showFieldError(id, problems[field] ?? null);
            if (problems[field] && !first)
                first = id;
        }
        if (first) {
            say(msg, 'error', 'Ret det, der er markeret, og prøv igen.');
            return payeeInput(first).focus();
        }
        send.disabled = true;
        say(msg, null);
        say(byId('kt-payee-ok'), null);
        const r = await save(payeeArgs(f));
        send.disabled = false;
        if (r.error || !r.payee)
            return say(msg, 'error', r.error ?? 'Noget gik galt. Prøv igen.');
        saved(r.payee);
        setEditing(false);
        say(byId('kt-payee-ok'), 'ok', 'Gemt. Vi overfører dine penge til den konto.');
        byId('udbetaling').focus();
    });
    return { fill: () => fillPayee(stored()) };
}
function flash(text) {
    const region = byId('kt-flash');
    say(region, 'ok', text);
    region.hidden = false;
    region.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function startKonto() {
    const demo = demoMode(location.search, location.hostname);
    const logout = byId('kt-logout');
    const copy = byId('kt-copy');
    let resetCopy = 0;
    let refocus = false;
    let data = null;
    let info = 'off';
    let editing = false;
    let now = Date.now();
    const settle = (v) => {
        setView(v);
        if (refocus)
            byId('kt-title').focus();
        refocus = false;
    };
    const more = byId('kt-rules-more');
    more.addEventListener('click', () => {
        byId('kt-rules-list').classList.add('is-open');
        more.setAttribute('aria-expanded', 'true');
        more.hidden = true;
    });
    copy.replaceChildren(icon(ICONS.copy), 'Kopiér');
    copy.addEventListener('click', async () => {
        const ok = await copyText(byId('kt-code').textContent ?? '');
        window.clearTimeout(resetCopy);
        copy.classList.toggle('is-done', ok);
        copy.replaceChildren(icon(ok ? ICONS.check : ICONS.copy), ok ? 'Kopieret' : 'Kopiér');
        byId('kt-copy-msg').textContent = ok ? 'Koden er kopieret.' : 'Kunne ikke kopiere. Markér koden, og kopiér den selv.';
        resetCopy = window.setTimeout(() => {
            copy.classList.remove('is-done');
            copy.replaceChildren(icon(ICONS.copy), 'Kopiér');
        }, 2200);
    });
    const ctx = () => (data ? { d: data, today: copenhagenDay(now) } : null);
    let forms = null;
    const render = () => {
        if (!data)
            return;
        const s = summarize(withPayoutInfo(data, info === 'off' ? null : info), now);
        renderHero(data);
        renderMoney(s, data.videos.length);
        renderFunnel(s, data.creator.code);
        renderVideos(s, copenhagenDay(now), { post: (r) => forms?.openLink(r), stats: (r) => forms?.openStats(r), again: (r) => forms?.openUp(r.title) });
        renderPayouts(s, info);
        renderPayee(info, s, editing);
    };
    const payee = startPayee(() => info, (args) => saveTo(args), (y) => {
        if (info !== 'off')
            info = { ...info, payee: y };
    }, (on) => {
        editing = on;
        render();
    });
    let saveTo = async () => ({ payee: null, error: 'Noget gik galt.' });
    if (demo !== null) {
        byId('pt-demo').hidden = false;
        logout.hidden = false;
        logout.addEventListener('click', () => location.assign(LOGIN_PATH + '?demo=ud'));
        byId('kt-none-logout').addEventListener('click', () => location.assign(LOGIN_PATH + '?demo'));
        byId('kt-retry').addEventListener('click', () => location.reload());
        const pretend = {
            reserve: async (type) => uploadPath(data?.folder ?? 'demo', freshId(), type),
            upload: (_path, _file, _type, onProgress) => new Promise((resolve) => {
                let x = 0;
                const t = window.setInterval(() => {
                    x = Math.min(1, x + 0.09);
                    onProgress(x);
                    if (x >= 1) {
                        window.clearInterval(t);
                        window.setTimeout(() => resolve(null), 350);
                    }
                }, 120);
            }),
            rpc: async (fn, args) => {
                await new Promise((r) => setTimeout(r, 300));
                if (!data)
                    return 'Noget gik galt.';
                const iso = new Date(now).toISOString();
                const find = (id) => data?.videos.find((v) => v.id === id);
                if (fn === 'creator_submit_draft') {
                    data.videos.unshift({ id: `demo-${data.videos.length}`, title: args.video_title ?? null, state: 'review', posted_on: null, month: null, tiktok_url: null, tiktok_views: null, tiktok_viewers: null, tiktok_public_views: null, instagram_url: null, instagram_views: null, instagram_viewers: null, instagram_public_views: null, rejected: false, note: null, draft_note: args.video_note ?? null, created_at: iso, decided_at: null, stats_sent_at: null });
                }
                else if (fn === 'creator_mark_posted') {
                    const v = find(args.video_id);
                    if (v)
                        Object.assign(v, { state: 'posted', tiktok_url: args.tiktok_link, instagram_url: args.instagram_link, posted_on: args.posted_day, month: null });
                }
                else if (fn === 'creator_send_stats') {
                    const v = find(args.video_id);
                    if (v)
                        Object.assign(v, { state: 'counting', stats_sent_at: iso, tiktok_views: args.tiktok_count, tiktok_viewers: args.tiktok_people, instagram_views: args.instagram_count, instagram_viewers: args.instagram_people });
                }
                return null;
            },
        };
        forms = startForms(ctx, pretend, async () => render());
        saveTo = async (args) => {
            await new Promise((r) => setTimeout(r, 400));
            const old = info === 'off' ? null : info.payee;
            const tax = args.payee_tax_id ?? null;
            const acc = args.payee_account ?? null;
            const kind = args.payee_kind === 'company' ? 'company' : 'person';
            return { payee: { kind, full_name: args.payee_name ?? '', address: args.payee_address ?? '', postcode: args.payee_postcode ?? '', city: args.payee_city ?? '', tax_id_last4: tax ? tax.slice(-4) : (old?.tax_id_last4 ?? ''), reg_no: args.payee_reg_no ?? '', account_last4: acc ? acc.slice(-4) : (old?.account_last4 ?? ''), updated_at: new Date(now).toISOString() }, error: null };
        };
        window.setTimeout(() => {
            if (demo === 'fejl')
                return settle('error');
            const d = demoData(now, demo);
            if (d && d.admin && !d.creator)
                return location.replace(ADMIN_PATH + '?demo');
            if (!d) {
                byId('kt-none-email').textContent = 'maja.hansen@gmail.com';
                return settle('none');
            }
            data = d;
            info = demoPayoutInfo(now, demo, d);
            payee.fill();
            render();
            settle('dash');
            if (demo === 'udbetaling')
                byId('udbetaling').scrollIntoView({ block: 'start' });
            if (demo === 'upload') {
                forms?.upFile.demoPick({ name: 'pasta-bowls-final.mov', size: 38400000 });
                byId('kt-up-title').value = 'Pasta-bowls til hele ugen';
                forms?.openUp();
            }
            if (demo === 'link') {
                const r = d.videos.find((v) => v.state === 'approved');
                if (r)
                    forms?.openLink(r);
            }
            if (demo === 'stats') {
                const r = d.videos.find((v) => statsReady(v, copenhagenDay(now)));
                if (r)
                    forms?.openStats(r);
            }
        }, 450);
        return;
    }
    const bad = linkError(location.hash, location.search);
    if (bad)
        return location.replace(`${LOGIN_PATH}?fejl=${bad === 'expired' ? 'udloebet' : 'link'}`);
    const client = portalClient();
    if (!client)
        return setView('error');
    const signOut = async (then) => {
        logout.disabled = true;
        await client.auth.signOut().catch(() => undefined);
        location.replace(then);
    };
    logout.addEventListener('click', () => void signOut(LOGIN_PATH + '?ud=1'));
    byId('kt-none-logout').addEventListener('click', () => void signOut(LOGIN_PATH));
    const real = {
        reserve: async (type) => {
            const { data: name, error } = await client.rpc('creator_reserve_upload', { file_type: type });
            if (error || typeof name !== 'string')
                throw new Error(refusalText(error?.message));
            return name;
        },
        upload: async (path, file, type, onProgress) => {
            const r = await uploadFile(client, UPLOAD_BUCKET, path, file, type, onProgress);
            return r.ok ? null : uploadErrorText(r.status, r.body);
        },
        rpc: async (fn, args) => {
            const { error } = await client.rpc(fn, args);
            return error ? refusalText(error.message) : null;
        },
    };
    const load = async (quiet = false) => {
        if (!quiet)
            setView('loading');
        const { data: session } = await client.auth.getSession();
        if (!session.session)
            return location.replace(LOGIN_PATH);
        logout.hidden = false;
        const { data: raw, error } = await client.rpc('creator_dashboard');
        if (error) {
            if (/jwt|token|401|not authenticated/i.test(`${error.code} ${error.message}`)) {
                await client.auth.signOut().catch(() => undefined);
                return location.replace(LOGIN_PATH);
            }
            return settle('error');
        }
        const d = parseDashboard(raw);
        if (!d) {
            if (raw && typeof raw === 'object' && raw.admin === true)
                return location.replace(ADMIN_PATH);
            byId('kt-none-email').textContent = session.session.user.email ?? '';
            return settle('none');
        }
        const serverNow = Date.parse(d.now);
        now = Number.isFinite(serverNow) ? serverNow : Date.now();
        data = d;
        const pay = await client.rpc('creator_payout_info');
        const first = info === 'off';
        info = pay.error ? 'off' : (parsePayoutInfo(pay.data) ?? 'off');
        if (first)
            payee.fill();
        render();
        settle('dash');
    };
    forms = startForms(ctx, real, () => load(true).catch(() => settle('error')));
    saveTo = async (args) => {
        const { data: raw, error } = await client.rpc('creator_save_payee', args);
        return error ? { payee: null, error: refusalText(error.message) } : { payee: parsePayee(raw), error: null };
    };
    byId('kt-retry').addEventListener('click', () => {
        refocus = true;
        void load().catch(() => settle('error'));
    });
    void load().catch(() => settle('error'));
}
startKonto();
})();
