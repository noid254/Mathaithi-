'use strict';
/* Builds a starter site from the signup questionnaire. Template copy always works with no network.
   If ANTHROPIC_API_KEY is set, the about text and welcome post are polished by Claude (best effort, falls back to the template). */

const RESERVED = new Set(['www', 'admin', 'api', 'app', 'start', 'mail', 'shop', 'store', 'support', 'help', 'static', 'img', 'uploads', 'tukosoko', 'platform', 'login', 'signup', 'super', 'test', 'demo']);
const SPORTS = { football: 'football' };
const clamp = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

function slugOk(slug) { return /^[a-z][a-z0-9]{2,23}$/.test(slug) && !RESERVED.has(slug); }
function slugFrom(name) { return String(name || '').toLowerCase().replace(/\b(fc|united|football|club|sc|afc|the)\b/g, '').replace(/[^a-z0-9]/g, '').slice(0, 20) || 'myclub'; }
function shortFrom(name) {
  const w = String(name || '').replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  return (w.length > 1 ? w.slice(0, 3).map(x => x[0]).join('') : (w[0] || 'FC').slice(0, 3)).toUpperCase();
}

const SQUADS = { A: 'Team A', B: 'Team B', W: 'Women', U17: 'Under 17', U15: 'Under 15', U13: 'Under 13', U10: 'Under 10' };
const DAYS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

/* Turn raw questionnaire answers into clean, validated club settings. Returns { ok, errors, club }. */
function normalise(a) {
  const errors = [], club = {};
  club.name = clamp(a.name, 60); if (club.name.length < 3) errors.push('Enter your club name.');
  club.short = clamp(a.short || shortFrom(club.name), 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || shortFrom(club.name);
  club.slug = clamp(a.slug || slugFrom(club.name), 24).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slugOk(club.slug)) errors.push('Pick a web address: 3 to 24 letters or numbers, starting with a letter.');
  club.sport = SPORTS[a.sport] ? a.sport : 'football';
  club.est = Math.min(new Date().getFullYear(), Math.max(1900, Math.round(+a.est) || new Date().getFullYear()));
  club.town = clamp(a.town, 60); club.county = clamp(a.county, 40);
  club.motto = clamp(a.motto, 80);
  club.primary = /^#[0-9a-f]{6}$/i.test(a.primary) ? a.primary.toLowerCase() : '#1fa463';
  club.secondary = /^#[0-9a-f]{6}$/i.test(a.secondary) ? a.secondary.toLowerCase() : '#ffffff';
  club.squads = (Array.isArray(a.squads) ? a.squads : []).map(k => String(k)).filter(k => SQUADS[k]).filter((k, i, l) => l.indexOf(k) === i).map(k => ({ id: k, name: SQUADS[k] }));
  if (!club.squads.length) club.squads = [{ id: 'A', name: SQUADS.A }];
  club.trainDays = (Array.isArray(a.trainDays) ? a.trainDays : []).filter(d => DAYS[d]).filter((d, i, l) => l.indexOf(d) === i);
  club.trainTime = /^\d{2}:\d{2}$/.test(a.trainTime) ? a.trainTime : '16:30';
  club.ground = clamp(a.ground, 80);
  const f = a.features || {};
  club.features = { shop: f.shop !== false, tickets: f.tickets !== false, fundraising: f.fundraising !== false, training: f.training !== false };
  club.contactPhone = clamp(a.contactPhone, 20);
  club.owner = clamp(a.owner, 60);
  club.email = clamp(a.email, 40).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(club.email)) errors.push('Enter a valid email. You will use it to sign in.');
  club.password = String(a.password || '');
  if (club.password.length < 8) errors.push('Password must be at least 8 characters.');
  if (!club.owner) errors.push('Enter your name.');
  return { ok: !errors.length, errors, club };
}

/* Starter content from templates. Everything is editable in admin afterwards. */
function template(c) {
  const place = c.town ? ' in ' + c.town : '';
  const motto = c.motto || 'Together on and off the pitch';
  const about = c.name + ' is a ' + c.sport + ' club' + place + ', founded in ' + c.est + '. ' +
    'We run ' + c.squads.length + ' squad' + (c.squads.length > 1 ? 's' : '') + ' and train ' + (c.trainDays.length ? c.trainDays.map(d => DAYS[d]).join(', ') : 'during the week') + (c.ground ? ' at ' + c.ground : '') + '. ' +
    'Everyone is welcome: players, parents, volunteers and supporters. Every shirt, ticket and gift helps the club grow.';
  const posts = [{
    cat: 'Club', title: 'Welcome to the new ' + c.name + ' website',
    body: 'We are online. Here you will find fixtures, results, player profiles and news from ' + c.name + '.\n\n' +
      (c.features.shop ? 'Design and order the official club kit from the Shop. A share of every sale goes straight to the club.\n\n' : '') +
      (c.features.fundraising ? 'You can also back our fundraising goals from the Support tab.' : 'Follow along and join the fan club for match-day reminders.')
  }];
  const training = c.squads.map((s) => ({ sq: s.id, days: c.trainDays.length ? c.trainDays.map(d => DAYS[d]).join(' & ') : 'To be confirmed', time: c.trainTime }));
  const funds = c.features.fundraising ? [
    { t: 'Training equipment', acct: 'EQUIP', goal: 60000, got: 0, d: 'Balls, cones and bibs so every player trains properly.' },
    { t: 'Match-day travel', acct: 'TRAVEL', goal: 40000, got: 0, d: 'Fuel and transport so the team and fans get to away games.' }
  ] : [];
  const packs = [
    { id: 'chest', t: 'Chest sponsor', p: 50000, d: 'Your name across the front of every match shirt and on the club website.' },
    { id: 'sleeve', t: 'Sleeve sponsor', p: 25000, d: 'Your logo on the sleeve of every squad.' },
    { id: 'training', t: 'Training sponsor', p: 15000, d: 'Your name on training kit and at the pitch.' }
  ];
  return { motto, about, posts, training, funds, packs, coachWord: { q: 'We play for the badge and for the people who turn up every week. Thank you for backing us.', by: 'The coach' } };
}

/* Optional: polish the two bits of prose with Claude. Never throws, never blocks signup for long. */
async function polish(c, t) {
  const key = process.env.ANTHROPIC_API_KEY; if (!key) return t;
  try {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 12000);
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal, headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5', max_tokens: 500,
        messages: [{ role: 'user', content: 'Rewrite these two texts for a Kenyan grassroots ' + c.sport + ' club website. Warm, plain English, no hype, no invented facts or numbers. Keep the same facts.\nReturn JSON only: {"about": "...", "welcome": "..."}.\n\nABOUT: ' + t.about + '\n\nWELCOME: ' + t.posts[0].body }] })
    });
    clearTimeout(timer); if (!r.ok) return t;
    const j = await r.json(), txt = ((j.content || [])[0] || {}).text || '', m = /\{[\s\S]*\}/.exec(txt); if (!m) return t;
    const o = JSON.parse(m[0]);
    if (typeof o.about === 'string' && o.about.length > 40 && o.about.length < 900) t.about = o.about;
    if (typeof o.welcome === 'string' && o.welcome.length > 40 && o.welcome.length < 1500) t.posts[0].body = o.welcome;
  } catch (e) { /* keep the template */ }
  return t;
}
module.exports = { normalise, template, polish, slugOk, slugFrom, shortFrom, SQUADS, DAYS, RESERVED };
