'use strict';
/* Club-in-a-box API + static server. No dependencies. Data lives in data/db.json, photos in uploads/.
   Test-grade security only: change the seeded passwords before real use. */
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');
const PORT = +process.env.PORT || 3010, ROOT = __dirname, DATA = path.join(ROOT, 'data'), UP = path.join(ROOT, 'uploads'), DBF = path.join(DATA, 'db.json');
[DATA, UP].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

const uid = (n) => crypto.randomBytes(n || 5).toString('hex');
const hash = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const mkUser = (username, pw, role, team, name) => { const salt = uid(8); return { id: uid(4), username, salt, hash: hash(pw, salt), role, team: team || null, name }; };
const DAY = 864e5;

function seed() {
  const now = Date.now(), sat = (k) => { const d = new Date(now + k * DAY); d.setHours(15, 0, 0, 0); return d.toISOString(); };
  const db = {
    settings: { jerseyPrice: 1650, share: { shirt: 35, merch: 35, ticket: 90 }, fanDiscount: 10 },
    teams: [
      { id: 'mathaithi', name: 'Mathaithi United', short: 'MU', est: 2000, motto: 'Pride of the Community', primary: '#f6c400', crest: 'img/crest.png', host: 'mathaithi.tukosoko.com', active: true },
      { id: 'riverside', name: 'Riverside Rovers', short: 'RR', est: 2011, motto: 'Sample club', primary: '#1fa463', crest: null, host: 'riverside.tukosoko.com', active: true },
      { id: 'highland', name: 'Highland Stars', short: 'HS', est: 2008, motto: 'Sample club', primary: '#e3262f', crest: null, host: 'highland.tukosoko.com', active: true }
    ],
    users: [
      mkUser('super', 'super123', 'super', null, 'Super Admin'),
      mkUser('coach', 'coach123', 'admin', 'mathaithi', 'Coach (Mathaithi)'),
      mkUser('rovers', 'rovers123', 'admin', 'riverside', 'Rovers admin'),
      mkUser('stars', 'stars123', 'admin', 'highland', 'Stars admin')
    ],
    products: [
      { id: 'm1', title: 'Supporter scarf', price: 900, art: 'scarf', active: true }, { id: 'm2', title: 'Club cap', price: 1200, art: 'cap', active: true },
      { id: 'm3', title: 'Training top', price: 2200, art: 'shirt', active: true }, { id: 'm4', title: 'Water bottle', price: 700, art: 'bottle', active: true },
      { id: 'm5', title: 'Match ball', price: 1800, art: 'ball', active: true }, { id: 'm6', title: 'Kit bag', price: 2000, art: 'bag', active: true }
    ],
    matches: [
      { id: uid(3), team: 'mathaithi', status: 'result', squad: 'Team A', opp: 'Ridge Rangers', date: sat(-9), home: true, comp: 'League', price: 100, sf: 2, sa: 1, scorers: 'B. Mwangi 23, K. Otieno 78', motm: 'Brian Mwangi', motmWhy: 'Two-goal involvement and non-stop pressing', report: 'Sample report. A bright first half ended with Brian Mwangi opening the scoring. Ridge pulled one back before Kevin Otieno restored the lead late on.', att: 240, photos: ['img/celebration.jpg'] },
      { id: uid(3), team: 'mathaithi', status: 'result', squad: 'Under 17', opp: 'Lakeview FC', date: sat(-2), home: false, comp: 'League', price: 50, sf: 3, sa: 3, scorers: 'I. Gitau 10, 55, 80', motm: 'Ian Gitau', motmWhy: 'Hat-trick from the front', report: 'Sample report. A thriller on the road, with Ian Gitau scoring a hat-trick in a 3-3 draw.', att: 120, photos: ['img/kick.jpg'] },
      { id: uid(3), team: 'mathaithi', status: 'fixture', squad: 'Team A', opp: 'Kamukunji Kings', date: sat(5), home: true, comp: 'League', price: 100 },
      { id: uid(3), team: 'mathaithi', status: 'fixture', squad: 'Under 13', opp: 'Savannah United', date: sat(12), home: false, comp: 'League', price: 50 },
      { id: uid(3), team: 'mathaithi', status: 'fixture', squad: 'Team B', opp: 'Unity Youth', date: sat(19), home: true, comp: 'Friendly', price: 100 },
      { id: uid(3), team: 'riverside', status: 'fixture', squad: 'First team', opp: 'Highland Stars', date: sat(6), home: true, comp: 'League', price: 100 }
    ],
    posts: [
      { id: uid(3), team: 'mathaithi', cat: 'Match', title: 'Late winner keeps Team A top of the table', body: 'Sample story. Lorem ipsum dolor sit amet, consectetur adipiscing elit.\n\nThe coach praised the bench for the energy it brought.', img: 'img/celebration.jpg', at: new Date(now - 2 * DAY).toISOString() },
      { id: uid(3), team: 'mathaithi', cat: 'Academy', title: 'Under 13s start the season with a clean sheet', body: 'Sample story. A disciplined shape and brave goalkeeping gave the youngsters their first win.', img: 'img/tactics.jpg', at: new Date(now - 4 * DAY).toISOString() },
      { id: uid(3), team: 'mathaithi', cat: 'Community', title: 'Boots for the Under 10s: halfway there', body: 'Sample story. Supporters have funded nine pairs of boots this month. Give from the Support tab.', img: 'img/bench.jpg', at: new Date(now - 7 * DAY).toISOString() }
    ],
    gallery: [
      { id: uid(3), team: 'mathaithi', url: 'img/celebration.jpg', caption: 'Cup run' }, { id: uid(3), team: 'mathaithi', url: 'img/flag.jpg', caption: 'Away day' },
      { id: uid(3), team: 'mathaithi', url: 'img/hoops.jpg', caption: 'New kit' }, { id: uid(3), team: 'mathaithi', url: 'img/bus.jpg', caption: 'The bus' }
    ],
    orders: [], payouts: [], fans: [], sessions: {}
  };
  // a few sample orders so the dashboards are not empty
  const mk = (team, items, who, daysAgo) => addOrder(db, team, items, who, '0712000' + Math.floor(100 + Math.random() * 899), true, new Date(now - daysAgo * DAY).toISOString(), 'processed');
  mk('mathaithi', [{ kind: 'shirt', title: 'Home shirt', detail: 'AMANI 7' }, { kind: 'ticket', title: 'Match ticket', price: 100 }], 'Amani W.', 6);
  mk('mathaithi', [{ kind: 'shirt', title: 'Home shirt', detail: 'FAITH 10' }, { kind: 'merch', ref: 'm1' }], 'Faith N.', 4);
  mk('mathaithi', [{ kind: 'merch', ref: 'm2' }], 'Kamau J.', 3);
  mk('riverside', [{ kind: 'shirt', title: 'Home shirt', detail: 'OTIS 9' }], 'Otis R.', 5);
  mk('highland', [{ kind: 'shirt', title: 'Away shirt', detail: 'LENA 4' }, { kind: 'merch', ref: 'm4' }], 'Lena H.', 2);
  return db;
}
function addOrder(db, team, items, name, phone, fan, at, status) {
  const S = db.settings, lines = items.slice(0, 20).map(it => {
    let price = 0, title = String(it.title || '').slice(0, 80);
    if (it.kind === 'shirt') price = S.jerseyPrice;
    else if (it.kind === 'merch') { const p = db.products.find(x => x.id === it.ref && x.active); if (!p) return null; price = p.price; title = p.title; }
    else if (it.kind === 'ticket') { const m = db.matches.find(x => x.id === it.ref && x.team === team); price = m ? m.price : Math.min(500, Math.max(0, +it.price || 100)); }
    else return null;
    const disc = fan && it.kind !== 'ticket' ? Math.round(price * S.fanDiscount / 100) : 0, net = price - disc;
    return { kind: it.kind, ref: it.ref || null, title, detail: String(it.detail || '').slice(0, 80), price, net, share: Math.round(net * (S.share[it.kind] || 0) / 100) };
  }).filter(Boolean);
  if (!lines.length) return null;
  const total = lines.reduce((a, l) => a + l.net, 0), club = lines.reduce((a, l) => a + l.share, 0);
  const o = { id: 'ORD-' + uid(3).toUpperCase(), team, name: String(name || '').slice(0, 60), phone: String(phone || '').slice(0, 20), fan: !!fan, items: lines, gross: lines.reduce((a, l) => a + l.price, 0), total, club, platform: total - club, status: status || 'new', at: at || new Date().toISOString() };
  db.orders.push(o); return o;
}
let DB;
function load() { try { DB = JSON.parse(fs.readFileSync(DBF, 'utf8')); } catch (e) { DB = seed(); save(); } }
function save() { const t = DBF + '.tmp'; fs.writeFileSync(t, JSON.stringify(DB)); fs.renameSync(t, DBF); }
load();

/* ---------- helpers ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req, max) => new Promise((ok, no) => { let n = 0, b = []; req.on('data', c => { n += c.length; if (n > (max || 9e6)) { no(new Error('too large')); req.destroy(); } else b.push(c); }); req.on('end', () => { try { ok(b.length ? JSON.parse(Buffer.concat(b).toString()) : {}); } catch (e) { no(new Error('bad json')); } }); });
const clean = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, n || 200);
const num = (v, d) => { v = +v; return isFinite(v) ? v : (d || 0); };
const teamBy = (id) => DB.teams.find(t => t.id === id);
const hostTeam = (req, q) => { if (q.team) { const t = teamBy(q.team); if (t && t.active) return t; } const h = String(req.headers.host || '').split(':')[0].toLowerCase(); return DB.teams.find(t => t.active && t.host === h) || teamBy('mathaithi'); };
function userOf(req) { const m = /^Bearer (\w+)$/.exec(req.headers.authorization || ''); if (!m) return null; const s = DB.sessions[m[1]]; if (!s || s.exp < Date.now()) return null; return DB.users.find(u => u.id === s.uid) || null; }
const fails = {};
function summary(team) {
  const os = DB.orders.filter(o => o.team === team && o.status !== 'cancelled'), by = {};
  os.forEach(o => o.items.forEach(i => { by[i.kind] = by[i.kind] || { n: 0, amt: 0, club: 0 }; by[i.kind].n++; by[i.kind].amt += i.net; by[i.kind].club += i.share; }));
  const expected = os.reduce((a, o) => a + o.club, 0), paid = DB.payouts.filter(p => p.team === team).reduce((a, p) => a + p.amount, 0);
  return { orders: os.length, sales: os.reduce((a, o) => a + o.total, 0), expected, paid, balance: expected - paid, by, fans: DB.fans.filter(f => f.team === team).length, matches: DB.matches.filter(m => m.team === team).length, posts: DB.posts.filter(p => p.team === team).length };
}
function saveImage(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || ''); if (!m) throw new Error('bad image');
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > 6e6) throw new Error('image too large');
  const f = uid(8) + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]); fs.writeFileSync(path.join(UP, f), buf); return 'uploads/' + f;
}

/* ---------- API ---------- */
async function api(req, res, u) {
  const p = u.pathname, q = Object.fromEntries(u.searchParams), M = req.method;
  if (p === '/api/login' && M === 'POST') {
    const ip = req.socket.remoteAddress, f = fails[ip] || { n: 0, t: 0 }; if (f.n >= 8 && Date.now() - f.t < 6e4) return send(res, 429, { error: 'Too many tries. Wait a minute.' });
    const b = await readBody(req, 1e4), us = DB.users.find(x => x.username === clean(b.username, 40).toLowerCase());
    if (!us || hash(b.password, us.salt) !== us.hash) { fails[ip] = { n: f.n + 1, t: Date.now() }; return send(res, 401, { error: 'Wrong username or password' }); }
    delete fails[ip]; const tok = uid(16); DB.sessions[tok] = { uid: us.id, exp: Date.now() + 7 * DAY }; save();
    return send(res, 200, { token: tok, user: { name: us.name, role: us.role, team: us.team, username: us.username } });
  }
  if (p === '/api/public' && M === 'GET') {
    const t = hostTeam(req, q), S = DB.settings;
    return send(res, 200, { team: { id: t.id, name: t.name, short: t.short, est: t.est, motto: t.motto, primary: t.primary, crest: t.crest },
      settings: { jerseyPrice: S.jerseyPrice, shirtShare: S.share.shirt, fanDiscount: S.fanDiscount },
      products: DB.products.filter(x => x.active), matches: DB.matches.filter(m => m.team === t.id).sort((a, b) => a.date < b.date ? -1 : 1),
      posts: DB.posts.filter(x => x.team === t.id).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 30), gallery: DB.gallery.filter(g => g.team === t.id).slice(-24).reverse() });
  }
  if (p === '/api/orders' && M === 'POST') {
    const b = await readBody(req, 5e5), t = teamBy(clean(b.team, 30)); if (!t || !t.active) return send(res, 400, { error: 'unknown team' });
    const o = addOrder(DB, t.id, Array.isArray(b.items) ? b.items : [], clean(b.name, 60), clean(b.phone, 20), !!b.fan); if (!o) return send(res, 400, { error: 'empty order' });
    save(); return send(res, 200, { id: o.id, total: o.total });
  }
  if (p === '/api/fans' && M === 'POST') {
    const b = await readBody(req, 1e4), t = teamBy(clean(b.team, 30)); if (!t) return send(res, 400, { error: 'unknown team' });
    const ph = clean(b.phone, 20); if (!DB.fans.some(f => f.team === t.id && f.phone === ph)) { DB.fans.push({ id: uid(4), team: t.id, name: clean(b.name, 60), phone: ph, sms: !!b.sms, at: new Date().toISOString() }); save(); }
    return send(res, 200, { ok: true });
  }
  const me = userOf(req); if (!me) return send(res, 401, { error: 'login required' });
  if (p === '/api/me') return send(res, 200, { name: me.name, role: me.role, team: me.team, username: me.username });
  if (p === '/api/logout' && M === 'POST') { const m = /^Bearer (\w+)$/.exec(req.headers.authorization); delete DB.sessions[m[1]]; save(); return send(res, 200, { ok: true }); }
  if (p === '/api/upload' && M === 'POST') { const b = await readBody(req); return send(res, 200, { url: saveImage(b.data) }); }

  /* super-only */
  if (p.startsWith('/api/super/')) {
    if (me.role !== 'super') return send(res, 403, { error: 'super admin only' });
    if (p === '/api/super/overview') {
      const rows = DB.teams.map(t => Object.assign({ id: t.id, name: t.name, active: t.active }, summary(t.id)));
      const prod = {}; DB.orders.filter(o => o.status !== 'cancelled').forEach(o => o.items.forEach(i => { const k = i.kind === 'shirt' ? 'Club jersey' : i.title; prod[k] = (prod[k] || 0) + 1; }));
      const os = DB.orders.filter(o => o.status !== 'cancelled');
      return send(res, 200, { teams: rows, totals: { orders: os.length, sales: os.reduce((a, o) => a + o.total, 0), platform: os.reduce((a, o) => a + o.platform, 0), toTeams: os.reduce((a, o) => a + o.club, 0), paid: DB.payouts.reduce((a, o) => a + o.amount, 0), fans: DB.fans.length, newOrders: DB.orders.filter(o => o.status === 'new').length }, top: Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 6), settings: DB.settings });
    }
    if (p === '/api/super/teams' && M === 'GET') return send(res, 200, DB.teams.map(t => Object.assign({}, t, { admins: DB.users.filter(u => u.team === t.id).map(u => u.username) })));
    if (p === '/api/super/teams' && M === 'POST') {
      const b = await readBody(req, 1e5), id = clean(b.id, 24).toLowerCase().replace(/[^a-z0-9]/g, ''); if (!id || teamBy(id)) return send(res, 400, { error: 'Pick a unique team id (letters/numbers)' });
      const un = clean(b.adminUser, 30).toLowerCase().replace(/[^a-z0-9]/g, ''), pw = clean(b.adminPass, 60); if (!un || pw.length < 6 || DB.users.some(x => x.username === un)) return send(res, 400, { error: 'Admin username must be unique and password 6+ chars' });
      DB.teams.push({ id, name: clean(b.name, 60), short: clean(b.short, 3).toUpperCase(), est: num(b.est, 2020), motto: clean(b.motto, 80), primary: /^#[0-9a-f]{6}$/i.test(b.primary) ? b.primary : '#1fa463', crest: null, host: clean(b.host, 80).toLowerCase(), active: true });
      DB.users.push(mkUser(un, pw, 'admin', id, clean(b.name, 60) + ' admin')); save(); return send(res, 200, { ok: true });
    }
    let m;
    if ((m = /^\/api\/super\/teams\/(\w+)$/.exec(p)) && M === 'PUT') {
      const t = teamBy(m[1]); if (!t) return send(res, 404, {}); const b = await readBody(req, 1e5);
      if ('active' in b) t.active = !!b.active; if (b.name) t.name = clean(b.name, 60); if (b.primary && /^#[0-9a-f]{6}$/i.test(b.primary)) t.primary = b.primary; if ('host' in b) t.host = clean(b.host, 80).toLowerCase(); if (b.crest) t.crest = clean(b.crest, 200);
      if (b.newPass) { if (String(b.newPass).length < 6) return send(res, 400, { error: 'Password 6+ chars' }); const us = DB.users.find(x => x.team === t.id); if (us) { us.salt = uid(8); us.hash = hash(b.newPass, us.salt); } }
      save(); return send(res, 200, { ok: true });
    }
    if (p === '/api/super/settings' && M === 'PUT') {
      const b = await readBody(req, 1e4), S = DB.settings;
      if (b.jerseyPrice != null) S.jerseyPrice = Math.max(100, Math.round(num(b.jerseyPrice, S.jerseyPrice)));
      if (b.share) ['shirt', 'merch', 'ticket'].forEach(k => { if (b.share[k] != null) S.share[k] = Math.min(100, Math.max(0, Math.round(num(b.share[k], S.share[k])))); });
      if (b.fanDiscount != null) S.fanDiscount = Math.min(50, Math.max(0, Math.round(num(b.fanDiscount, 10)))); save(); return send(res, 200, S);
    }
    if (p === '/api/super/products' && M === 'GET') return send(res, 200, DB.products);
    if (p === '/api/super/products' && M === 'POST') { const b = await readBody(req, 1e5); const it = { id: 'm' + uid(3), title: clean(b.title, 60), price: Math.max(0, Math.round(num(b.price))), art: ['scarf', 'cap', 'shirt', 'bottle', 'ball', 'bag'].includes(b.art) ? b.art : 'shirt', active: true }; if (!it.title || !it.price) return send(res, 400, { error: 'Title and price needed' }); DB.products.push(it); save(); return send(res, 200, it); }
    if ((m = /^\/api\/super\/products\/(\w+)$/.exec(p))) {
      const it = DB.products.find(x => x.id === m[1]); if (!it) return send(res, 404, {});
      if (M === 'DELETE') { DB.products.splice(DB.products.indexOf(it), 1); save(); return send(res, 200, {}); }
      const b = await readBody(req, 1e5); if (b.title) it.title = clean(b.title, 60); if (b.price != null) it.price = Math.max(0, Math.round(num(b.price))); if ('active' in b) it.active = !!b.active; save(); return send(res, 200, it);
    }
    if (p === '/api/super/orders') return send(res, 200, DB.orders.slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 300));
    if ((m = /^\/api\/super\/orders\/([\w-]+)$/.exec(p)) && M === 'PUT') { const o = DB.orders.find(x => x.id === m[1]); if (!o) return send(res, 404, {}); const b = await readBody(req, 1e4); if (['new', 'processed', 'shipped', 'cancelled'].includes(b.status)) o.status = b.status; save(); return send(res, 200, o); }
    if (p === '/api/super/payouts' && M === 'GET') return send(res, 200, DB.payouts.slice().reverse());
    if (p === '/api/super/payouts' && M === 'POST') { const b = await readBody(req, 1e4), t = teamBy(clean(b.team, 30)), a = Math.round(num(b.amount)); if (!t || a <= 0) return send(res, 400, { error: 'Pick a team and an amount' }); DB.payouts.push({ id: uid(3), team: t.id, amount: a, ref: clean(b.ref, 40), note: clean(b.note, 120), at: new Date().toISOString() }); save(); return send(res, 200, { ok: true }); }
    return send(res, 404, { error: 'not found' });
  }

  /* team admin (super may act on any team via ?team=) */
  const team = me.role === 'super' ? clean(q.team, 30) : me.team; if (!team || !teamBy(team)) return send(res, 400, { error: 'team required' });
  const mine = (arr) => arr.filter(x => x.team === team);
  if (p === '/api/admin/summary') return send(res, 200, Object.assign(summary(team), { settings: { share: DB.settings.share, jerseyPrice: DB.settings.jerseyPrice }, payouts: DB.payouts.filter(x => x.team === team).reverse(), team: teamBy(team) }));
  if (p === '/api/admin/orders') return send(res, 200, mine(DB.orders).sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 200));
  if (p === '/api/admin/fans') return send(res, 200, mine(DB.fans).reverse().slice(0, 200));
  const coll = { matches: DB.matches, posts: DB.posts, gallery: DB.gallery };
  let m = /^\/api\/admin\/(matches|posts|gallery)(?:\/(\w+))?(?:\/(rematch))?$/.exec(p);
  if (m) {
    const arr = coll[m[1]], kind = m[1];
    if (M === 'GET' && !m[2]) return send(res, 200, mine(arr).slice().sort((a, b) => (b.date || b.at || '') > (a.date || a.at || '') ? 1 : -1));
    if (M === 'POST' && !m[2]) { const b = await readBody(req, 2e5), it = { id: uid(3), team }; fill(kind, it, b); if (kind === 'posts') it.at = new Date().toISOString(); arr.push(it); save(); return send(res, 200, it); }
    const it = arr.find(x => x.id === m[2] && x.team === team); if (!it) return send(res, 404, { error: 'not found' });
    if (M === 'DELETE') { arr.splice(arr.indexOf(it), 1); save(); return send(res, 200, {}); }
    if (M === 'PUT') { const b = await readBody(req, 2e5); fill(kind, it, b); save(); return send(res, 200, it); }
    if (M === 'POST' && m[3] === 'rematch') { const b = await readBody(req, 1e4), d = new Date(b.date); if (isNaN(d)) return send(res, 400, { error: 'Pick a date and time' }); const n = { id: uid(3), team, status: 'fixture', squad: it.squad, opp: it.opp, date: d.toISOString(), home: !it.home, comp: it.comp, price: it.price, rematchOf: it.id }; arr.push(n); save(); return send(res, 200, n); }
  }
  return send(res, 404, { error: 'not found' });
}
function fill(kind, it, b) {
  if (kind === 'matches') {
    ['squad', 'opp', 'comp', 'scorers', 'motm', 'motmWhy'].forEach(k => { if (k in b) it[k] = clean(b[k], k === 'scorers' ? 160 : 80); }); if ('report' in b) it.report = clean(b.report, 3000);
    if (b.date) { const d = new Date(b.date); if (!isNaN(d)) it.date = d.toISOString(); } if ('home' in b) it.home = !!b.home; if ('price' in b) it.price = Math.max(0, Math.min(1000, Math.round(num(b.price, 100))));
    if (b.status === 'fixture' || b.status === 'result') it.status = b.status;
    if (it.status === 'result') { if ('sf' in b) it.sf = Math.max(0, Math.round(num(b.sf))); if ('sa' in b) it.sa = Math.max(0, Math.round(num(b.sa))); if ('att' in b) it.att = Math.max(0, Math.round(num(b.att))); }
    if (Array.isArray(b.photos)) it.photos = b.photos.filter(x => /^(uploads|img)\/[\w.\-]+$/.test(x)).slice(0, 8);
  } else if (kind === 'posts') { ['cat', 'title'].forEach(k => { if (k in b) it[k] = clean(b[k], 120); }); if ('body' in b) it.body = clean(b.body, 6000); if ('img' in b) it.img = /^(uploads|img)\/[\w.\-]+$/.test(b.img) ? b.img : null; }
  else { if (/^(uploads|img)\/[\w.\-]+$/.test(b.url || '')) it.url = b.url; if ('caption' in b) it.caption = clean(b.caption, 80); }
}

/* ---------- static + server ---------- */
const PUBLIC_OK = /^\/(index\.html|admin\.html|img\/[\w.\-]+|uploads\/[\w.\-]+)$/;
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  try {
    if (u.pathname.startsWith('/api/')) return await api(req, res, u);
    let p = u.pathname; if (p === '/') p = '/index.html'; if (p === '/admin' || p === '/admin/') p = '/admin.html';
    if (!PUBLIC_OK.test(p)) { res.writeHead(404); return res.end('Not found'); }
    const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': p.startsWith('/uploads') || p.startsWith('/img') ? 'public, max-age=86400' : 'no-cache' });
    fs.createReadStream(f).pipe(res);
  } catch (e) { if (!res.headersSent) send(res, 400, { error: e.message }); }
}).listen(PORT, '127.0.0.1', () => console.log('Club API on http://127.0.0.1:' + PORT));
