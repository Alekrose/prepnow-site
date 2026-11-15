/* PrepNow creator pages: built by scripts/site/build.ts from scripts/site/creator/ */
(function () {
'use strict';
if (window.top !== window.self) { try { window.top.location = window.location.href; } catch (e) {} return; }
const CONFIG = {"url":"https://tceajmlpeyuadhcoxdcx.supabase.co","anonKey":"sb_publishable_NzGp4d9agSvEP9lExUsSMQ_SJN-0kr8"};
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

// scripts/site/creator/login.ts
const CONTACT = 'kontakt@prepnow.dk';
const ICON_ALERT = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 5.8v5M10 13.9v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_INFO = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 9v5M10 6.2v.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_OK = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.6 10.3l2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function say(region, kind, ...parts) {
    region.replaceChildren();
    if (!kind)
        return;
    const icon = document.createElement('span');
    icon.innerHTML = kind === 'error' ? ICON_ALERT : kind === 'ok' ? ICON_OK : ICON_INFO;
    region.append(h('p', { class: `pt-msg pt-msg--${kind}` }, icon.firstChild, h('span', {}, ...parts)));
}
const mailLink = () => h('a', { href: `mailto:${CONTACT}` }, CONTACT);
const UNKNOWN = () => ['Vi kan ikke finde et creator-login til den e-mail. Brug den e-mail, du søgte med, eller skriv til ', mailLink(), '.'];
const JUST_SENT = 'Vi har lige sendt dig et link. Kig i din indbakke, også i spam. Du kan få et nyt om lidt.';
function startLogin() {
    const form = byId('pt-form');
    const email = byId('pt-email');
    const emailMsg = byId('pt-email-msg');
    const send = byId('pt-send');
    const flash = byId('pt-flash');
    const sent = byId('pt-sent');
    const sentTitle = byId('pt-sent-title');
    const sentTo = byId('pt-sent-to');
    const codeForm = byId('pt-code-form');
    const code = byId('pt-code');
    const codeMsg = byId('pt-code-msg');
    const codeBtn = byId('pt-code-btn');
    const resend = byId('pt-resend');
    const other = byId('pt-other');
    const demo = demoMode(location.search, location.hostname);
    const client = demo === null ? portalClient() : null;
    let address = '';
    let waitAddress = '';
    let waitUntil = 0;
    let timer = 0;
    let sending = false;
    let broken = false;
    if (demo !== null)
        byId('pt-demo').hidden = false;
    const params = new URLSearchParams(location.search);
    const why = demo === 'udloebet' ? 'udloebet' : demo === 'ud' ? 'ud' : params.get('fejl') ?? (params.has('ud') ? 'ud' : null);
    if (why === 'udloebet')
        say(flash, 'info', 'Linket er udløbet eller allerede brugt. Skriv din e-mail, så sender vi et nyt.');
    else if (why === 'link')
        say(flash, 'error', 'Linket virkede ikke. Skriv din e-mail, så sender vi et nyt.');
    else if (why === 'ud')
        say(flash, 'ok', 'Du er logget ud.');
    flash.hidden = !why;
    const secondsLeft = () => Math.max(0, Math.ceil((waitUntil - Date.now()) / 1000));
    const typed = () => email.value.trim().toLowerCase();
    const tick = () => {
        const left = secondsLeft();
        resend.disabled = left > 0;
        resend.textContent = left > 0 ? `send en ny om ${left} s` : 'send en ny';
        if (!sending) {
            const wait = left > 0 && typed() === waitAddress;
            send.disabled = wait || broken;
            send.textContent = wait ? `Send nyt link om ${left} s` : 'Send login-link';
        }
        if (left <= 0)
            window.clearInterval(timer);
    };
    const waitFor = (to, seconds) => {
        waitAddress = to;
        waitUntil = Date.now() + seconds * 1000;
        window.clearInterval(timer);
        timer = window.setInterval(tick, 1000);
        tick();
    };
    const busy = (on) => {
        sending = on;
        form.setAttribute('aria-busy', String(on));
        if (on) {
            send.disabled = true;
            send.textContent = 'Sender …';
        }
        else
            tick();
    };
    const showSent = (to) => {
        address = to;
        sentTo.textContent = to;
        form.hidden = true;
        flash.hidden = true;
        sent.hidden = false;
        code.value = '';
        say(codeMsg, null);
        sentTitle.focus();
    };
    const showForm = () => {
        sent.hidden = true;
        form.hidden = false;
        tick();
        email.focus();
        email.select();
    };
    const fieldError = (...parts) => {
        email.setAttribute('aria-invalid', 'true');
        say(emailMsg, 'error', ...parts);
        email.focus();
    };
    const fail = (...parts) => {
        fieldError(...parts);
        return false;
    };
    const mustWait = (to, seconds) => {
        waitFor(to, seconds);
        email.removeAttribute('aria-invalid');
        say(emailMsg, 'info', JUST_SENT);
        return false;
    };
    async function sendLink(to) {
        if (demo !== null) {
            await new Promise((r) => setTimeout(r, 500));
            if (!/maja|creator|demo/.test(to))
                return fail(...UNKNOWN());
            return true;
        }
        if (!client)
            return fail('Login virker ikke lige nu. Skriv til ', mailLink(), ', så hjælper vi.');
        const check = await client.rpc('creator_login_check', { login_email: to });
        if (check.error) {
            const kind = otpErrorKind({ message: check.error.message, code: check.error.code });
            return fail(kind === 'offline' ? 'Vi kunne ikke få forbindelse. Tjek dit internet, og prøv igen.' : 'Noget gik galt. Prøv igen om lidt.');
        }
        if (check.data !== true)
            return fail(...UNKNOWN());
        const { error } = await client.auth.signInWithOtp({ email: to, options: { shouldCreateUser: false, emailRedirectTo: location.origin + KONTO_PATH } });
        if (!error)
            return true;
        const kind = otpErrorKind(error);
        if (kind === 'wait')
            return mustWait(to, waitSeconds(error.message));
        if (kind === 'unknown')
            return fail(...UNKNOWN());
        if (kind === 'offline')
            return fail('Vi kunne ikke få forbindelse. Tjek dit internet, og prøv igen.');
        return fail('Vi kunne ikke sende mailen. Prøv igen om lidt, eller skriv til ', mailLink(), '.');
    }
    email.addEventListener('input', () => {
        email.removeAttribute('aria-invalid');
        say(emailMsg, null);
        tick();
    });
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const to = typed();
        if (!looksLikeEmail(to))
            return fieldError(to ? 'Det ligner ikke en e-mail. Tjek, at den er skrevet rigtigt.' : 'Skriv din e-mail.');
        if (to === waitAddress && secondsLeft() > 0)
            return void mustWait(to, secondsLeft());
        busy(true);
        try {
            if (await sendLink(to)) {
                waitFor(to, 60);
                showSent(to);
            }
        }
        catch {
            fieldError('Vi kunne ikke få forbindelse. Tjek dit internet, og prøv igen.');
        }
        finally {
            busy(false);
        }
    });
    async function sendAgain() {
        if (!address)
            return;
        const left = secondsLeft();
        if (left > 0)
            return say(codeMsg, 'info', `Du kan få en ny mail om ${left} sekunder. Kig i spam imens.`);
        resend.disabled = true;
        try {
            if (await sendLink(address)) {
                say(codeMsg, 'ok', 'Vi har sendt en ny mail. Brug koden fra den nyeste.');
                waitFor(address, 60);
            }
            else {
                showForm();
            }
        }
        finally {
            tick();
        }
    }
    const wrongCode = () => {
        code.setAttribute('aria-invalid', 'true');
        const again = h('button', { class: 'pt-linkbtn', type: 'button' }, 'send en ny kode');
        again.addEventListener('click', () => void sendAgain());
        say(codeMsg, 'error', 'Koden passer ikke, eller den er udløbet. Brug koden fra den nyeste mail, eller ', again, '.');
        code.focus();
    };
    codeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const token = code.value.replace(/\D/g, '');
        if (token.length < 6) {
            code.setAttribute('aria-invalid', 'true');
            say(codeMsg, 'error', 'Skriv de 6 cifre fra mailen.');
            return code.focus();
        }
        codeBtn.disabled = true;
        try {
            if (demo !== null) {
                await new Promise((r) => setTimeout(r, 400));
                if (token !== '123456')
                    throw new Error('wrong');
                location.href = KONTO_PATH + '?demo';
                return;
            }
            if (!client)
                throw new Error('no client');
            const { error } = await client.auth.verifyOtp({ email: address, token, type: 'email' });
            if (error)
                throw error;
            location.replace(KONTO_PATH);
        }
        catch (err) {
            if (otpErrorKind(err) === 'offline')
                say(codeMsg, 'error', 'Vi kunne ikke få forbindelse. Prøv igen.');
            else
                wrongCode();
        }
        finally {
            codeBtn.disabled = false;
        }
    });
    code.addEventListener('input', () => {
        code.removeAttribute('aria-invalid');
        say(codeMsg, null);
    });
    resend.addEventListener('click', () => void sendAgain());
    other.addEventListener('click', () => showForm());
    if (demo === 'sendt' || demo === 'kode') {
        email.value = 'maja@eksempel.dk';
        waitFor('maja@eksempel.dk', 42);
        showSent('maja@eksempel.dk');
        if (demo === 'kode') {
            code.value = '418230';
            wrongCode();
        }
    }
    else if (demo === 'ukendt') {
        email.value = 'maja.hansen@gmail.com';
        fieldError(...UNKNOWN());
    }
    else if (demo === 'travl') {
        email.value = 'maja@eksempel.dk';
        mustWait('maja@eksempel.dk', 48);
    }
    if (client) {
        void client.auth.getSession().then(({ data }) => {
            if (data.session)
                location.replace(KONTO_PATH);
        });
    }
    else if (demo === null) {
        broken = true;
        fieldError('Login virker ikke lige nu. Skriv til ', mailLink(), ', så hjælper vi.');
        tick();
    }
}
startLogin();
})();
