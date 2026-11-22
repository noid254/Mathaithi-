'use strict';
/* Platform routes: signup, kits (design + markup), club profile, CMS collections, leads, donations, payments.
   server.js owns auth, orders core and static files; this module is handed a context object by server.js. */
const fs = require('fs'), path = require('path');
const Kit = require('./kit.js'), pay = require('./payments.js'), gen = require('./signup.js');

module.exports = function (C) {
  const { db, save, send, readBody, clean, num, uid, mkUser, teamBy, saveImage, addOrder, ROOT, BASE, DAY, normPh } = C;
  const IMG = /^(uploads|img)\/[\w.\-]+$/, HEX = /^#[0-9a-f]{6}$/i;

  /* ---------- small helpers ---------- */
  const hits = {};
  function ipOf(req) { return String(req.headers['cf-connecting-ip'] || (req.headers['x-forwarded-for'] || '').split(',')[0] || req.socket.remoteAddress).trim(); }
  function limited(req, key, max, ms) {
    const k = key + ':' + ipOf(req), now = Date.now(), h = (hits[k] = (hits[k] || []).filter(t => now - t < ms));
    if (h.length >= max) return true; h.push(now); return false;
  }
  const shortName = (n) => { const w = String(n || '').trim().split(/\s+/); return w.length > 1 ? w[0] + ' ' + w[w.length - 1][0] + '.' : (w[0] || 'Fan'); };
  const kitPrice = (k) => { const S = db().settings; return S.kit.base + Math.min(S.kit.maxMarkup, Math.max(S.kit.minMarkup, Math.round(k.markup || 0))); };
  const pubKit = (k) => ({ id: k.id, name: k.name, kind: k.kind, spec: k.spec, sponsor: k.sponsor || '', price: kitPrice(k), closes: k.closes || null });
  const effFeatures = (t) => { const f = t.features || {}, ok = !!t.approved; return { shop: f.shop !== false && ok, tickets: f.tickets !== false && ok, fundraising: f.fundraising !== false && ok, training: f.training !== false }; };
  const squadsOf = (t) => (t.squads && t.squads.length ? t.squads : [{ id: 'A', name: 'Team A' }]);

  function addKits(teamId, list, markup) { list.forEach(k => db().kits.push({ id: 'k' + uid(3), team: teamId, name: k.name, kind: k.kind, spec: k.spec, sponsor: '', markup: markup == null ? 650 : markup, active: true, closes: null })); }

  function publicTeam(t) {
    return { id: t.id, name: t.name, short: t.short, est: t.est, motto: t.motto, primary: t.primary, secondary: t.secondary, crest: t.crest, about: t.about || '', coachWord: t.coachWord || null,
      town: t.town || '', ground: t.ground || '', contactPhone: t.contactPhone || '', squads: squadsOf(t), features: effFeatures(t), packs: t.packs || [], honours: t.honours || [], paybillNote: t.paybillNote || '', approved: !!t.approved };
  }
  /* Everything the club site needs beyond the base payload. */
  function publicExtras(t) {
    const D = db(), S = D.settings, mine = (a) => a.filter(x => x.team === t.id);
    const ok = !!t.approved;
    const standings = mine(D.standings).map(r => ({ id: r.id, n: r.n, p: r.p, w: r.w, d: r.d, l: r.l, pts: r.w * 3 + r.d, us: !!r.us })).sort((a, b) => b.pts - a.pts || b.w - a.w);
    const topFans = mine(D.fans).map(f => ({ n: shortName(f.name), pts: (f.blob && f.blob.points) || 0 })).filter(f => f.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 6);
    return {
      team: publicTeam(t), kits: ok ? mine(D.kits).filter(k => k.active).map(pubKit) : [], players: mine(D.players), training: mine(D.training), funds: mine(D.funds), standings, topFans,
      shop: { sizes: S.sizes, delivery: S.delivery, kitBase: S.kit.base, feePct: S.kit.feePct, fan: S.fanDiscount }, payMode: pay.live() ? 'mpesa' : 'demo', textures: Kit.TEXTURES
    };
  }

  /* ---------- crest as embedded data for print files ---------- */
  function crestData(url) {
    try {
      if (!IMG.test(url || '')) return null; const f = path.join(ROOT, url); if (!f.startsWith(ROOT) || !fs.existsSync(f)) return null;
      const ext = path.extname(f).slice(1).toLowerCase(), mime = ext === 'jpg' ? 'jpeg' : ext;
      return 'data:image/' + mime + ';base64,' + fs.readFileSync(f).toString('base64');
    } catch (e) { return null; }
  }

  /* ---------- generic CRUD for simple per-team collections ---------- */
  const SCHEMA = {
    players: { n: ['s', 60], sq: ['s', 12], pos: ['s', 30], no: ['n', 0, 99], age: ['n', 0, 99], g: ['n', 0, 999], a: ['n', 0, 999], ap: ['n', 0, 999], bio: ['s', 400], star: ['b'], photo: ['img'] },
    training: { sq: ['s', 12], days: ['s', 40], time: ['s', 10] },
    funds: { t: ['s', 60], acct: ['s', 12], goal: ['n', 0, 1e7], got: ['n', 0, 1e7], d: ['s', 200] },
    standings: { n: ['s', 60], p: ['n', 0, 999], w: ['n', 0, 999], d: ['n', 0, 999], l: ['n', 0, 999], us: ['b'] }
  };
  function fillGeneric(kind, it, b) {
    const sc = SCHEMA[kind];
    Object.keys(sc).forEach(k => {
      if (!(k in b)) return; const d = sc[k], v = b[k];
      if (d[0] === 's') it[k] = clean(v, d[1]); else if (d[0] === 'n') it[k] = Math.min(d[2], Math.max(d[1], Math.round(num(v)))); else if (d[0] === 'b') it[k] = !!v; else if (d[0] === 'img') it[k] = IMG.test(v || '') ? v : null;
    });
    if (kind === 'standings') { it.p = it.w + it.d + it.l; }
  }

  /* ---------- kits ---------- */
  function kitFrom(b, t, existing) {
    const S = db().settings, errors = [];
    const v = Kit.validate(b.spec, { minContrast: S.design.minContrast });
    v.errors.forEach(e => errors.push(e));
    const name = clean(b.name, 40).trim(); if (!name) errors.push('Give the kit a name.');
    const kind = Kit.KINDS.includes(b.kind) ? b.kind : 'home';
    const sponsor = clean(b.sponsor, S.design.maxSponsorChars).replace(/[^A-Za-z0-9 .&'\-]/g, '').trim();
    const markup = Math.min(S.kit.maxMarkup, Math.max(S.kit.minMarkup, Math.round(num(b.markup, 0))));
    let closes = null; if (b.closes) { const d = new Date(b.closes); if (isNaN(d)) errors.push('Closing date is not valid.'); else closes = d.toISOString(); }
    return { errors, kit: Object.assign(existing || { id: 'k' + uid(3), team: t }, { name, kind, spec: v.spec, sponsor, markup, closes, active: b.active !== false }) };
  }

  /* ---------- order creation with payment ---------- */
  async function createOrder(req, res) {
    if (limited(req, 'order', 20, 36e5)) return send(res, 429, { error: 'Too many orders from this connection. Try again later.' });
    const b = await readBody(req, 5e5), t = teamBy(clean(b.team, 30));
    if (!t || !t.active) return send(res, 400, { error: 'unknown team' });
    if (!t.approved) return send(res, 403, { error: 'This club\'s shop is not open yet.' });
    const ph = pay.msisdn(b.phone); if (!ph) return send(res, 400, { error: 'Enter a valid Kenyan phone number.' });
    const isFan = !!b.fan && db().fans.some(f => f.team === t.id && normPh(f.phone) === normPh(b.phone)); /* discount only for registered fans */
    const r = addOrder(db(), t.id, Array.isArray(b.items) ? b.items : [], clean(b.name, 60), clean(b.phone, 20), isFan, null, pay.live() ? 'awaiting_payment' : 'new', { live: true, delivery: b.delivery });
    if (r.error) return send(res, 400, { error: r.error });
    const o = r.order;
    if (pay.live()) {
      try { const s = await pay.stkPush({ phone: ph, amount: o.total, ref: o.id, desc: t.short + ' order' }); o.pay = { provider: 'mpesa', checkout: s.checkout }; }
      catch (e) { db().orders.splice(db().orders.indexOf(o), 1); save(); return send(res, 502, { error: 'Could not start M-Pesa payment: ' + e.message }); }
    } else o.pay = { provider: 'demo' };
    save(); return send(res, 200, { id: o.id, total: o.total, mode: o.pay.provider === 'mpesa' ? 'mpesa' : 'demo', delivery: o.delivery || null });
  }

  /* ---------- public routes (no login) ---------- */
  async function pub(req, res, p, q, M) {
    if (p === '/api/signup/check' && M === 'GET') {
      const s = clean(q.slug, 30).toLowerCase();
      if (!gen.slugOk(s)) return send(res, 200, { ok: false, reason: 'Use 3 to 24 letters or numbers, starting with a letter. Some words are reserved.' });
      if (teamBy(s)) return send(res, 200, { ok: false, reason: 'Taken. Try another.' });
      return send(res, 200, { ok: true, host: s + '.' + BASE });
    }
    if (p === '/api/signup' && M === 'POST') {
      if (limited(req, 'signup', 5, 36e5)) return send(res, 429, { error: 'Too many signups from this connection. Try again in an hour.' });
      const b = await readBody(req, 4e6), n = gen.normalise(b); if (!n.ok) return send(res, 400, { error: n.errors[0], errors: n.errors });
      const c = n.club, D = db();
      if (teamBy(c.slug)) return send(res, 400, { error: 'That web address is taken. Pick another.' });
      if (D.users.some(u => u.username === c.email)) return send(res, 400, { error: 'An account with this email already exists. Sign in instead.' });
      let crest = null; if (b.crest) { try { if (String(b.crest).length > 2.8e6) throw new Error('big'); crest = saveImage(b.crest); } catch (e) { return send(res, 400, { error: 'Crest image must be a PNG, JPG or WebP under 2 MB.' }); } }
      let t = await gen.polish(c, gen.template(c));
      const now = new Date().toISOString();
      D.teams.push({ id: c.slug, name: c.name, short: c.short, est: c.est, motto: t.motto, primary: c.primary, secondary: c.secondary, crest, host: c.slug + '.' + BASE, active: true, approved: false, seeded: true,
        about: t.about, coachWord: t.coachWord, town: c.town, county: c.county, ground: c.ground, sport: c.sport, contactPhone: c.contactPhone, squads: c.squads, features: c.features, packs: t.packs, honours: [], paybillNote: '', createdAt: now, owner: { name: c.owner, email: c.email } });
      const user = mkUser(c.email, c.password, 'admin', c.slug, c.owner); D.users.push(user);
      t.posts.forEach(po => D.posts.push({ id: uid(3), team: c.slug, cat: po.cat, title: po.title, body: po.body, img: null, at: now }));
      t.training.forEach(tr => D.training.push({ id: uid(3), team: c.slug, sq: tr.sq, days: tr.days, time: tr.time }));
      t.funds.forEach(f => D.funds.push(Object.assign({ id: uid(3), team: c.slug }, f)));
      D.standings.push({ id: uid(3), team: c.slug, n: c.name, p: 0, w: 0, d: 0, l: 0, us: true });
      addKits(c.slug, Kit.autoKits(c.primary, c.secondary));
      const tok = uid(16); D.sessions[tok] = { uid: user.id, exp: Date.now() + 7 * DAY }; save();
      return send(res, 200, { ok: true, token: tok, user: { name: user.name, role: user.role, team: user.team, username: user.username }, host: c.slug + '.' + BASE });
    }
    if (p === '/api/orders' && M === 'POST') { await createOrder(req, res); return true; }
    if (p === '/api/orders/status' && M === 'GET') {
      const o = db().orders.find(x => x.id === clean(q.id, 20) && normPh(x.phone) === normPh(q.phone)); if (!o) return send(res, 404, { error: 'not found' });
      return send(res, 200, { status: o.status, paid: o.status !== 'awaiting_payment' && o.status !== 'payment_failed' });
    }
    if (p === '/api/leads' && M === 'POST') {
      if (limited(req, 'lead', 10, 36e5)) return send(res, 429, { error: 'Too many requests. Try again later.' });
      const b = await readBody(req, 2e4), t = teamBy(clean(b.team, 30)); if (!t || !t.active) return send(res, 400, { error: 'unknown team' });
      const type = ['enrol', 'booking', 'sponsor'].includes(b.type) ? b.type : null; if (!type) return send(res, 400, { error: 'bad type' });
      const data = {}; Object.keys(b.data || {}).slice(0, 12).forEach(k => { data[clean(k, 24)] = clean(b.data[k], 200); });
      if (data.phone && normPh(data.phone).length < 9) return send(res, 400, { error: 'Enter a valid phone number.' });
      const l = { id: uid(3), team: t.id, type, data, status: 'new', at: new Date().toISOString() }; db().leads.push(l); save();
      return send(res, 200, { ref: 'L-' + l.id.toUpperCase() });
    }
    if (p === '/api/give' && M === 'POST') {
      if (limited(req, 'give', 10, 36e5)) return send(res, 429, { error: 'Too many requests. Try again later.' });
      const b = await readBody(req, 1e4), t = teamBy(clean(b.team, 30)); if (!t || !t.active) return send(res, 400, { error: 'unknown team' });
      if (!t.approved) return send(res, 403, { error: 'Giving is not open for this club yet.' });
      const f = db().funds.find(x => x.id === clean(b.fund, 20) && x.team === t.id), amt = Math.round(num(b.amount)), ph = pay.msisdn(b.phone);
      if (!f) return send(res, 400, { error: 'Pick a fund.' }); if (!(amt >= 50 && amt <= 100000)) return send(res, 400, { error: 'Amount must be between KSh 50 and 100,000.' }); if (!ph) return send(res, 400, { error: 'Enter a valid Kenyan phone number.' });
      const d = { id: 'DON-' + uid(3).toUpperCase(), team: t.id, fund: f.id, amount: amt, phone: clean(b.phone, 20), name: clean(b.name, 60), status: pay.live() ? 'pending' : 'pledged', at: new Date().toISOString() };
      if (pay.live()) { try { const s = await pay.stkPush({ phone: ph, amount: amt, ref: d.id, desc: 'Donation' }); d.checkout = s.checkout; } catch (e) { return send(res, 502, { error: 'Could not start M-Pesa payment: ' + e.message }); } }
      db().donations.push(d); save(); return send(res, 200, { id: d.id, mode: pay.live() ? 'mpesa' : 'demo' });
    }
    if (p.startsWith('/api/pay/mpesa/') && M === 'POST') {
      const secret = process.env.MPESA_CALLBACK_SECRET; if (!secret || p !== '/api/pay/mpesa/' + secret) return send(res, 404, {});
      const cb = pay.parseCallback(await readBody(req, 1e5)); if (cb) {
        const D = db(), o = D.orders.find(x => x.pay && x.pay.checkout === cb.checkout), d = D.donations.find(x => x.checkout === cb.checkout);
        if (o && o.status === 'awaiting_payment') { if (cb.ok && Math.round(cb.amount) >= Math.round(o.total)) { o.status = 'new'; o.pay.receipt = cb.receipt; } else if (cb.ok) { o.status = 'new'; o.pay.receipt = cb.receipt; o.pay.review = 'Amount paid ' + cb.amount + ' differs from ' + o.total; } else { o.status = 'payment_failed'; o.pay.error = cb.desc; } }
        if (d && d.status === 'pending') { if (cb.ok) { d.status = 'paid'; d.receipt = cb.receipt; const f = D.funds.find(x => x.id === d.fund); if (f) f.got += d.amount; } else d.status = 'failed'; }
        save();
      }
      return send(res, 200, { ResultCode: 0, ResultDesc: 'Accepted' });
    }
    return false;
  }

  /* ---------- team admin routes ---------- */
  async function admin(req, res, p, q, M, me, team) {
    const D = db(), t = teamBy(team);
    if (p === '/api/admin/profile') {
      if (M === 'GET') return send(res, 200, Object.assign({ owner: t.owner || null, host: t.host }, publicTeam(t)));
      if (M === 'PUT') {
        const b = await readBody(req, 5e4);
        if ('name' in b && clean(b.name, 60).trim().length >= 3) t.name = clean(b.name, 60).trim();
        if ('short' in b) t.short = clean(b.short, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || t.short;
        ['motto', 'town', 'county', 'ground', 'contactPhone', 'paybillNote'].forEach(k => { if (k in b) t[k] = clean(b[k], k === 'paybillNote' ? 200 : 80); });
        if ('about' in b) t.about = clean(b.about, 1200);
        if ('est' in b) t.est = Math.min(new Date().getFullYear(), Math.max(1900, Math.round(num(b.est, t.est))));
        if (b.primary && HEX.test(b.primary)) t.primary = b.primary.toLowerCase(); if (b.secondary && HEX.test(b.secondary)) t.secondary = b.secondary.toLowerCase();
        if ('crest' in b) t.crest = IMG.test(b.crest || '') ? b.crest : (b.crest === null ? null : t.crest);
        if (b.coachWord) t.coachWord = { q: clean(b.coachWord.q, 300), by: clean(b.coachWord.by, 60) };
        if (b.features) t.features = { shop: !!b.features.shop, tickets: !!b.features.tickets, fundraising: !!b.features.fundraising, training: !!b.features.training };
        if (Array.isArray(b.squads)) { const sq = b.squads.slice(0, 10).map(s => ({ id: clean(s.id, 6).replace(/[^A-Za-z0-9]/g, ''), name: clean(s.name, 30).trim() })).filter(s => s.id && s.name); if (sq.length) t.squads = sq; }
        if (Array.isArray(b.honours)) t.honours = b.honours.slice(0, 6).map(h => ({ pos: Math.min(3, Math.max(1, Math.round(num(h.pos, 1)))), label: clean(h.label, 40) })).filter(h => h.label);
        if (Array.isArray(b.packs)) t.packs = b.packs.slice(0, 8).map(k => ({ id: clean(k.id || uid(2), 12).replace(/[^\w]/g, ''), t: clean(k.t, 60), p: Math.max(0, Math.round(num(k.p))), d: clean(k.d, 200) })).filter(k => k.t);
        save(); return send(res, 200, Object.assign({ owner: t.owner || null, host: t.host }, publicTeam(t)));
      }
    }
    if (p === '/api/admin/kits') {
      if (M === 'GET') return send(res, 200, { kits: D.kits.filter(k => k.team === team).map(k => Object.assign({}, k, { price: kitPrice(k) })), limits: { textures: Kit.TEXTURES, kinds: Kit.KINDS, base: D.settings.kit.base, minMarkup: D.settings.kit.minMarkup, maxMarkup: D.settings.kit.maxMarkup, minContrast: D.settings.design.minContrast, maxSponsorChars: D.settings.design.maxSponsorChars, feePct: D.settings.kit.feePct, sizes: D.settings.sizes }, approved: !!t.approved });
      if (M === 'POST') {
        if (D.kits.filter(k => k.team === team).length >= 8) return send(res, 400, { error: 'You can keep up to 8 kits. Remove one first.' });
        const r = kitFrom(await readBody(req, 2e4), team); if (r.errors.length) return send(res, 400, { error: r.errors[0], errors: r.errors });
        D.kits.push(r.kit); save(); return send(res, 200, Object.assign({}, r.kit, { price: kitPrice(r.kit) }));
      }
    }
    let m = /^\/api\/admin\/kits\/(\w+)$/.exec(p);
    if (m) {
      const k = D.kits.find(x => x.id === m[1] && x.team === team); if (!k) return send(res, 404, { error: 'not found' });
      if (M === 'DELETE') { D.kits.splice(D.kits.indexOf(k), 1); save(); return send(res, 200, {}); }
      if (M === 'PUT') { const r = kitFrom(await readBody(req, 2e4), team, k); if (r.errors.length) return send(res, 400, { error: r.errors[0], errors: r.errors }); save(); return send(res, 200, Object.assign({}, k, { price: kitPrice(k) })); }
    }
    if (p === '/api/admin/leads' && M === 'GET') return send(res, 200, D.leads.filter(l => l.team === team).slice().reverse().slice(0, 300));
    if ((m = /^\/api\/admin\/leads\/(\w+)$/.exec(p)) && M === 'PUT') { const l = D.leads.find(x => x.id === m[1] && x.team === team); if (!l) return send(res, 404, {}); const b = await readBody(req, 1e3); if (['new', 'contacted', 'done'].includes(b.status)) l.status = b.status; save(); return send(res, 200, l); }
    if (p === '/api/admin/donations' && M === 'GET') return send(res, 200, D.donations.filter(d => d.team === team).slice().reverse().slice(0, 300));
    /* simple collections */
    if ((m = /^\/api\/admin\/(players|training|funds|standings)(?:\/(\w+))?$/.exec(p))) {
      const kind = m[1], arr = D[kind];
      if (M === 'GET' && !m[2]) return send(res, 200, arr.filter(x => x.team === team));
      if (M === 'POST' && !m[2]) { if (arr.filter(x => x.team === team).length >= 200) return send(res, 400, { error: 'Limit reached.' }); const it = { id: uid(3), team }; fillGeneric(kind, it, await readBody(req, 2e4)); arr.push(it); save(); return send(res, 200, it); }
      const it = arr.find(x => x.id === m[2] && x.team === team); if (!it) return send(res, 404, { error: 'not found' });
      if (M === 'DELETE') { arr.splice(arr.indexOf(it), 1); save(); return send(res, 200, {}); }
      if (M === 'PUT') { fillGeneric(kind, it, await readBody(req, 2e4)); save(); return send(res, 200, it); }
    }
    return false;
  }

  /* ---------- super admin routes ---------- */
  async function sup(req, res, p, q, M) {
    const D = db(), S = D.settings;
    if (p === '/api/super/settings' && M === 'PUT') {
      const b = await readBody(req, 1e4), pct = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Math.round(num(v, d))));
      if (b.jerseyPrice != null) S.jerseyPrice = Math.max(100, Math.round(num(b.jerseyPrice, S.jerseyPrice)));
      if (b.share) ['shirt', 'merch', 'ticket'].forEach(k => { if (b.share[k] != null) S.share[k] = pct(b.share[k], S.share[k], 0, 100); });
      if (b.fanDiscount != null) S.fanDiscount = pct(b.fanDiscount, 10, 0, 50);
      if (b.kit) { const k = b.kit; if (k.base != null) S.kit.base = pct(k.base, S.kit.base, 0, 20000); if (k.feePct != null) S.kit.feePct = pct(k.feePct, S.kit.feePct, 0, 100); if (k.minMarkup != null) S.kit.minMarkup = pct(k.minMarkup, 0, 0, 20000); if (k.maxMarkup != null) S.kit.maxMarkup = Math.max(S.kit.minMarkup, pct(k.maxMarkup, 1500, 0, 20000)); }
      if (b.delivery) Object.keys(S.delivery).forEach(k => { if (b.delivery[k] && b.delivery[k].fee != null) S.delivery[k].fee = pct(b.delivery[k].fee, S.delivery[k].fee, 0, 5000); });
      if (b.design) { if (b.design.minContrast != null) S.design.minContrast = Math.min(7, Math.max(1.5, +b.design.minContrast || 3)); if (b.design.maxSponsorChars != null) S.design.maxSponsorChars = pct(b.design.maxSponsorChars, 14, 0, 16); }
      save(); return send(res, 200, S);
    }
    let m = /^\/api\/super\/orders\/([\w-]+)\/print$/.exec(p);
    if (m && M === 'GET') {
      const o = D.orders.find(x => x.id === m[1]); if (!o) return send(res, 404, { error: 'not found' });
      const line = o.items[Math.max(0, Math.round(num(q.i)))]; if (!line || line.kind !== 'kit') return send(res, 400, { error: 'That line is not a kit.' });
      const k = D.kits.find(x => x.id === line.ref), t = teamBy(o.team); if (!k) return send(res, 404, { error: 'Kit was removed.' });
      const svg = Kit.render(k.spec, { view: q.view === 'front' ? 'front' : 'back', name: (line.custom || {}).name, num: (line.custom || {}).num, crest: crestData(t.crest), short: t.short, sponsor: k.sponsor, uid: 'p', label: t.name + ' ' + k.name });
      res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store' }); return res.end(svg);
    }
    return false;
  }

  return { pub, admin, sup, publicExtras, publicTeam, addKits, kitPrice };
};
