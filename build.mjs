#!/usr/bin/env node
// Guildhall: builds a guild's site from guild.json into dist/. No dependencies; Node 18 or newer.
//
//   node build.mjs              build, with live member counts from the Discord invite (if it answers)
//   node build.mjs --offline    build without asking Discord
//
// The GitHub Action in .github/workflows/pages.yml runs this on every push and every six hours, so the counts stay fresh.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');
const g = JSON.parse(readFileSync(join(ROOT, 'guild.json'), 'utf8'));
const gifts = existsSync(join(ROOT, 'gifts.json')) ? JSON.parse(readFileSync(join(ROOT, 'gifts.json'), 'utf8')) : null;
const offline = process.argv.includes('--offline');

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icons = new Map();
function icon(name, cls = 'icon') {
  if (!icons.has(name)) {
    const file = join(ROOT, 'src', 'icons', `${name}.svg`);
    icons.set(name, existsSync(file) ? readFileSync(file, 'utf8').replace('<svg ', '<svg aria-hidden="true" focusable="false" ') : '');
  }
  return icons.get(name).replace('<svg ', `<svg class="${cls}" `);
}
const CLASS_COLORS = {
  Warrior: '#C69B6D', Paladin: '#F48CBA', Hunter: '#AAD372', Rogue: '#FFF468', Priest: '#FFFFFF',
  Shaman: '#0070DD', Mage: '#3FC7EB', Warlock: '#8788EE', Druid: '#FF7C0A',
};

/** Member and online counts from the public invite endpoint; null when Discord does not answer. */
async function discordCounts() {
  const code = (g.discord?.invite ?? '').split('/').pop();
  if (offline || !code) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/invites/${code}?with_counts=true`, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    return { members: j.approximate_member_count, online: j.approximate_presence_count };
  } catch (e) {
    console.warn(`discord counts skipped: ${e.message}`);
    return null;
  }
}

function head({ title, description, path = '' }) {
  const s = g.site;
  const url = s.url ? new URL(path, s.url).href : '';
  const image = s.url && s.image ? new URL(s.image, s.url).href : '';
  return `<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${url ? `<link rel="canonical" href="${esc(url)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${url ? `<meta property="og:url" content="${esc(url)}">` : ''}
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:image" content="${esc(image)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#000000">
<link rel="icon" href="${esc(s.favicon ?? 'images/favicon.png')}">
<link rel="preload" href="assets/fonts/Manrope.ttf" as="font" type="font/ttf" crossorigin>
<link rel="stylesheet" href="assets/style.css">
<style>:root{--accent:${esc(g.accent ?? '#8C9BFF')}}</style>`;
}

function nav(current = '') {
  const links = [['#tonight', 'Tonight'], ...((g.shortcuts ?? []).length ? [['#members', 'For members']] : []), ...(g.discord.ids?.crafters ? [['#crafters', 'Crafters']] : []), ['#join', 'Join']];
  const items = links.map(([href, label], i) => `<li style="--i:${i}"><a href="${current ? './' : ''}${href}">${esc(label)}</a></li>`).join('');
  return `<a class="skip" href="#main">Skip to content</a>
<header class="nav" data-nav>
  <a class="nav-brand" href="./" aria-current="${current ? 'false' : 'page'}">${esc(g.tag)}</a>
  <nav aria-label="Main"><ul class="nav-links">${items}</ul></nav>
  <a class="btn btn-sm btn-primary nav-cta" href="${esc(g.discord.invite)}" rel="noopener">${esc(g.discord.cta ?? 'Join on Discord')}</a>
  <button class="burger" type="button" aria-expanded="false" aria-controls="menu" aria-label="Open menu" data-burger><span></span><span></span></button>
</header>
<div class="menu" id="menu" hidden data-menu>
  <ul>${items}<li style="--i:${links.length}"><a class="btn btn-primary" href="${esc(g.discord.invite)}" rel="noopener">${esc(g.discord.cta ?? 'Join on Discord')}</a></li></ul>
</div>`;
}

function footer() {
  return `<footer class="footer">
  <div class="wrap footer-row">
    <p class="footer-brand">${esc(g.tag)} <button class="zone" type="button" data-zone hidden title="Next zone"></button></p>
    <ul class="footer-links">
      <li><a href="${esc(g.discord.invite)}" rel="noopener">Discord</a></li>
      ${gifts ? '<li><a href="gifts/">Gift guide</a></li>' : ''}
      <li><a href="privacy.html">Privacy</a></li>
      <li><a href="https://github.com/realworldbuilder/guildhall" rel="noopener">Made with Guildhall</a></li>
    </ul>
  </div>
  <p class="wrap footer-note">${esc(g.footer?.note ?? '')}</p>
</footer>`;
}

/** The title as words of letters, so the letters can rise one by one. */
const splitTitle = (text) => text.split(' ').map((w) => `<span class="word">${[...w].map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</span>`).join(' ');

const reveal = (html, tag = 'div', cls = '') => `<${tag} class="reveal ${cls}">${html}</${tag}>`;

const WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
/** The schedule with `daily` (every night at one time) spelled out as seven nights, so the page script needs one shape. */
function schedule() {
  const s = g.schedule;
  if (!s.daily) return { ...s, isDaily: false };
  return { ...s, isDaily: true, nights: WEEK.map((day) => ({ day, start: s.daily.start, plan: s.daily.plan })) };
}

function page(counts) {
  const sched = schedule();
  const proof = counts
    ? `<p class="proof">${icon('users-three')}<span><strong data-count="${counts.members}">${counts.members.toLocaleString('en-US')}</strong> on the Discord · <span class="live-dot" aria-hidden="true"></span><strong data-count="${counts.online}">${counts.online.toLocaleString('en-US')}</strong> online now</span></p>`
    : `<p class="proof">${icon('moon-stars')}<span>${esc(g.faction)} · ${esc(g.realm.type)} · ${esc(g.realm.region)}</span></p>`;

  const nights = sched.isDaily ? `
      <li class="card night night-daily reveal" data-day="*" data-start="${esc(sched.daily.start)}">
        <p class="night-day">${icon('calendar-dots')}Every night</p>
        <p class="night-time">${esc(fmt12(sched.daily.start))} ${esc(sched.zoneLabel)}</p>
        <p class="night-local" data-local aria-live="polite"></p>
        <p class="night-plan">${esc(sched.daily.plan)}</p>
      </li>` : sched.nights.map((n) => `
      <li class="card night reveal" data-day="${esc(n.day)}" data-start="${esc(n.start)}">
        <p class="night-day">${icon('calendar-dots')}${esc(n.day)}</p>
        <p class="night-time">${esc(fmt12(n.start))} ${esc(sched.zoneLabel)}</p>
        <p class="night-local" data-local aria-live="polite"></p>
        <p class="night-plan">${esc(n.plan)}</p>
      </li>`).join('');

  const ids = g.discord.ids ?? {};
  const chan = (id) => `https://discord.com/channels/${ids.server}/${id}`;
  const data = existsSync(join(ROOT, 'data', 'discord.json')) ? JSON.parse(readFileSync(join(ROOT, 'data', 'discord.json'), 'utf8')) : { events: [], crafters: [] };

  const emptyEvents = `
          <li class="event-empty" data-empty><p>Nothing scheduled yet.</p><p class="small">Officers: make an Event in Discord (Server menu, Create Event) in one of the guild's voice rooms and it shows up here within the hour.</p></li>`;
  const events = (data.events ?? []).map((e) => `
          <li class="event" data-end="${esc(e.end)}">
            <time class="event-when" datetime="${esc(e.start)}" data-when>${esc(e.start.slice(0, 16).replace('T', ' '))}</time>
            <div class="event-body"><p class="event-name">${esc(e.name)}${e.live ? ' <span class="pill">live</span>' : ''}</p>
            <p class="small">${e.where ? `${icon('map-pin', 'icon icon-sm')}${esc(e.where.replace(/^[^a-z0-9]+/i, ''))} · ` : ''}${e.going} going</p></div>
            <a class="event-go" href="${esc(e.url)}" rel="noopener" aria-label="Open ${esc(e.name)} in Discord">${icon('arrow-up-right')}</a>
          </li>`).join('') + emptyEvents;

  const shortcuts = (g.shortcuts ?? []).map((s) => `
        <li class="reveal"><a class="card shortcut" href="${esc(s.url ?? chan(s.channel))}" rel="noopener">${icon(s.icon, 'icon icon-lg')}<span><strong>${esc(s.label)}</strong><span class="small">${esc(s.text)}</span></span>${icon('arrow-up-right', 'icon go')}</a></li>`).join('');
  const ig = g.ingame;
  const ingame = ig ? `<div class="card ingame reveal">
        <h3>${icon('terminal-window')}In game</h3>
        <ul class="cmds">${(ig.commands ?? []).map((c) => `<li><kbd>${esc(c.cmd)}</kbd><span>${esc(c.text)}</span></li>`).join('')}</ul>
        ${(ig.addons ?? []).length ? `<h3>${icon('puzzle-piece')}Addons</h3><ul class="addons">${ig.addons.map((a) => `<li><a href="${esc(a.url)}" rel="noopener"><strong>${esc(a.name)}</strong>${icon('arrow-up-right', 'icon icon-sm')}</a><span class="small">${esc(a.text)}</span></li>`).join('')}</ul>` : ''}
      </div>` : '';

  const crafters = (data.crafters ?? []).length ? `<ul class="crafters">${data.crafters.map((c) => `
      <li class="reveal"><a class="card crafter" href="${esc(c.url)}" rel="noopener"><strong>${esc(c.name)}</strong><span class="small">${esc(c.makes || 'Ask in their post')}</span>${c.tags?.length ? `<span class="tags">${c.tags.map((x) => `<span class="pill">${esc(x)}</span>`).join('')}</span>` : ''}</a></li>`).join('')}
    </ul>` : `<div class="card empty reveal">${icon('hammer', 'icon icon-lg')}<div><p><strong>No crafters listed yet.</strong></p><p class="small">Make a post in the crafters channel titled with your name and what you make, like “Snickelfritz · Tailoring, Enchanting”. It shows up here within the hour.</p></div></div>`;

  const perks = (g.perks ?? []).map((p) => `
      <li class="card perk reveal">${icon(p.icon, 'icon icon-lg')}<h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('');

  const leaders = g.leaders.map((l) => `
      <article class="card leader reveal" data-tilt>
        <img src="${esc(l.image)}" alt="${esc(l.alt ?? l.name)}" width="640" height="640" loading="lazy">
        <div class="leader-body">
          <p class="leader-role">${esc(l.role)}</p>
          <h3>${esc(l.name)}</h3>
          <p class="leader-class"><span class="dot" style="background:${CLASS_COLORS[l.class] ?? 'var(--accent)'}"></span>${esc(l.race)} ${esc(l.class)}</p>
          <p class="leader-bio">${esc(l.bio)}</p>
          <ul class="leader-links">${(l.links ?? []).map((k) => `<li><a href="${esc(k.url)}" rel="noopener">${icon(k.icon)}${esc(k.label)}</a></li>`).join('')}</ul>
        </div>
      </article>`).join('');

  const steps = g.steps.map((s, i) => `
      <li class="step reveal"><span class="step-n" aria-hidden="true">${i + 1}</span><div class="card">${icon(s.icon, 'icon icon-lg')}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></div></li>`).join('');

  const gallery = (g.gallery ?? []).map((p, i) => `<li class="shot" style="--i:${i}"><img src="${esc(p.image)}" alt="${esc(p.alt)}" width="640" height="1147" loading="lazy"></li>`).join('');
  const marquee = (g.marquee ?? []).length ? `<div class="marquee" aria-hidden="true"><div class="marquee-track">${[0, 1].map(() => `<p>${g.marquee.map((w) => `<span>${esc(w)}</span>${icon('moon-stars')}`).join('')}</p>`).join('')}</div></div>` : '';

  const faq = g.faq.map((f) => `
      <details class="card faq-item reveal"><summary><span>${esc(f.q)}</span>${icon('plus')}</summary><p>${esc(f.a)}</p></details>`).join('');

  const tagline = (g.tagline ?? '').split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
  const cta = (cls = '') => `<a class="btn btn-primary ${cls}" href="${esc(g.discord.invite)}" rel="noopener">${icon('discord-logo')}${esc(g.discord.cta ?? 'Join on Discord')}</a>`;

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };

  return `<!doctype html>
<html lang="en">
<head>
${head({ title: g.site.title, description: g.site.description })}
<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>
</head>
<body class="${marquee ? 'has-ticker' : ''}">
${backdrop()}
${marquee}
${nav()}
<main id="main">
  <section class="hero wrap">
    <div class="hero-copy">
      <p class="eyebrow reveal">${esc(g.hero.eyebrow)}</p>
      <h1 class="hero-title" aria-label="${esc(g.tag)}"><span aria-hidden="true">${splitTitle(g.tag)}</span></h1>
      <p class="hero-lead reveal">${esc(g.hero.lead)}</p>
      <div class="hero-actions reveal">${cta()}<a class="btn btn-ghost" href="#tonight">${icon('clock')}<span data-status>See guild nights</span></a></div>
      ${reveal(proof)}
    </div>
    <figure class="hero-art reveal" data-tilt><img src="${esc(g.hero.image)}" alt="${esc(g.hero.alt)}" width="960" height="1720" fetchpriority="high"></figure>
  </section>

  <section class="section wrap" id="tonight" aria-labelledby="tonight-h">
    <div class="section-head reveal">
      <h2 id="tonight-h">Tonight</h2>
      <p class="status" data-status-long aria-live="polite">${sched.isDaily ? 'Every night' : esc(sched.nights.map((n) => n.day).join(', '))} from ${esc(fmt12(sched.nights[0].start))} ${esc(sched.zoneLabel)}</p>
    </div>
    <div class="tonight">
      <div class="tonight-main">
        <div class="clock reveal" data-clock aria-hidden="true">
          ${sched.isDaily ? '' : '<div><span data-u="d">00</span><small>days</small></div><b>:</b>'}
          <div><span data-u="h">00</span><small>hours</small></div><b>:</b>
          <div><span data-u="m">00</span><small>min</small></div><b>:</b>
          <div><span data-u="s">00</span><small>sec</small></div>
        </div>
        <ul class="grid grid-1">${nights}
        </ul>
      </div>
      <div class="card events reveal">
        <h3>${icon('calendar-dots')}Coming up</h3>
        <ul class="event-list" data-events>${events}
        </ul>
      </div>
    </div>
  </section>
${shortcuts ? `
  <section class="section wrap" id="members" aria-labelledby="members-h">
    <div class="section-head reveal"><h2 id="members-h">For members</h2><p>Opens the right spot in our Discord</p></div>
    <div class="members">
      <ul class="shortcuts">${shortcuts}
      </ul>
      ${ingame}
    </div>
  </section>` : ''}
${ids.crafters ? `
  <section class="section wrap" id="crafters" aria-labelledby="crafters-h">
    <div class="section-head reveal"><h2 id="crafters-h">Crafters</h2><a class="btn btn-ghost btn-sm" href="${esc(chan(ids.crafters))}" rel="noopener">${icon('hammer')}Add yourself</a></div>
    ${crafters}
  </section>` : ''}
${(g.perks ?? []).length ? `
  <section class="section wrap" id="perks" aria-labelledby="perks-h">
    <div class="section-head reveal"><h2 id="perks-h">What riding with us gets you</h2></div>
    <ul class="grid grid-3">${perks}
    </ul>
  </section>` : ''}
${g.tagline ? `
  <section class="tagline wrap" aria-label="What we're about">
    <p class="tagline-text" data-tagline>${tagline}</p>
  </section>` : ''}

  <section class="section wrap" id="join" aria-labelledby="join-h">
    <div class="section-head reveal"><h2 id="join-h">Not in the guild yet?</h2><p>${esc(g.faction)} only, ${esc(g.realm.type.toLowerCase().replace('normal (pve)', 'normal PvE'))} realm${g.realm.name ? ` <strong>${esc(g.realm.name)}</strong>` : ''}.</p></div>
    <div class="join">
      <ol class="timeline" data-timeline><span class="timeline-line" aria-hidden="true"><span></span></span>${steps}
      </ol>
      <div class="faq">${faq}
      </div>
    </div>
  </section>

  <section class="section wrap" id="leaders" aria-labelledby="leaders-h">
    <div class="section-head reveal"><h2 id="leaders-h">Who leads the ride</h2></div>
    <div class="grid grid-2">${leaders}
    </div>
  </section>
${(g.gallery ?? []).length ? `
  <section class="gallery" id="gallery" aria-labelledby="gallery-h" data-gallery>
    <div class="gallery-pin">
      <div class="section-head wrap reveal"><h2 id="gallery-h">From the stable</h2><p>Art from our guild nights</p></div>
      <ul class="gallery-track" data-track>${gallery}</ul>
    </div>
  </section>` : ''}

  <section class="section wrap final reveal" aria-labelledby="final-h">
    <h2 id="final-h">There's a saddle with your name on it</h2>
    <p>Join the Discord, press Apply in ${esc(g.discord.applyChannel)}, and ride with us tonight.</p>
    ${cta()}
  </section>
</main>
${footer()}
<script>window.GUILD=${JSON.stringify({ schedule: sched }).replace(/</g, '\\u003c')}</script>
${LIBS}
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

// Motion libraries from public CDNs (GSAP and ScrollTrigger: free GSAP licence; Lenis: MIT). Pinned versions.
const LIBS = `<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/gsap.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist/ScrollTrigger.min.js" defer></script>
<script src="https://cdn.jsdelivr.net/npm/lenis@1.3.4/dist/lenis.min.js" defer></script>`;

/** The three.js zone behind the page (src/azeroth.js), loaded when idle on machines that can run it. */
function backdrop() {
  if (g.backdrop === false) return '';
  const zones = JSON.stringify(g.backdrop?.zones ?? []);
  return `<canvas class="backdrop" aria-hidden="true"></canvas>
<div class="scrim" aria-hidden="true"></div>
<script type="module">
  const c = document.querySelector('canvas.backdrop');
  let gl = false; try { gl = !!document.createElement('canvas').getContext('webgl2'); } catch {}
  const n = navigator;
  if (c && gl && !matchMedia('(prefers-reduced-motion: reduce)').matches && (n.hardwareConcurrency ?? 8) >= 4 && (n.deviceMemory ?? 8) >= 4) {
    addEventListener('scenechange', (e) => {
      const z = document.querySelector('[data-zone]');
      if (z) { z.textContent = 'zones/' + e.detail.name; z.hidden = false; }
    });
    addEventListener('click', (e) => { if (e.target.closest('[data-zone]')) dispatchEvent(new Event('scenestep')); });
    const go = () => import('./assets/azeroth.js').then((m) => m.start(c, { zones: ${zones} })).catch(() => {});
    'requestIdleCallback' in window ? requestIdleCallback(go, { timeout: 1500 }) : setTimeout(go, 300);
  }
</script>`;
}

function simplePage({ title, path, body, cls = '', description, index = false }) {
  // 404.html is served at any missing address, however deep, so its links resolve from the site's root.
  // A page in a folder (gifts/index.html) gets a relative base, so assets/ and ./ resolve from the root.
  const depth = path.split('/').length - 1;
  const base = path === '404.html' && g.site.url ? `<base href="${esc(g.site.url)}">\n` : depth ? `<base href="${'../'.repeat(depth)}">\n` : '';
  return `<!doctype html>
<html lang="en">
<head>
${base}${head({ title: `${title} · ${g.tag}`, description: description ?? g.site.description, path: path.replace(/index\.html$/, '') })}
${index ? '' : '<meta name="robots" content="noindex">'}
</head>
<body>
${backdrop()}
${nav('sub')}
<main id="main" class="wrap simple ${cls}">
${body}
</main>
${footer()}
<script>window.GUILD=${JSON.stringify({ schedule: schedule() }).replace(/</g, '\\u003c')}</script>
${LIBS}
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

function fmt12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** Optional gift guide from gifts.json: each gift drawn as an item tooltip, its price band as its quality colour.
 *  amazon_tag / ebay_campid empty = plain links and no affiliate line. */
function giftsPage() {
  const tag = gifts.amazon_tag ?? '', camp = gifts.ebay_campid ?? '';
  const q = (s) => encodeURIComponent(s).replace(/%20/g, '+');
  const url = (x) => x.url ?? (x.store === 'ebay'
    ? `https://www.ebay.com/sch/i.html?_nkw=${q(x.q)}${camp ? `&mkcid=1&mkrid=711-53200-19255-0&campid=${camp}&toolid=10001&mkevt=1` : ''}`
    : `https://www.amazon.com/s?k=${q(x.q)}${tag ? `&tag=${tag}` : ''}`);
  const STORE = { amazon: 'Find it on Amazon', etsy: 'See the caps on Etsy', ebay: 'Find it on eBay' };
  const tip = (x, t) => {
    const paid = (x.store === 'amazon' && tag) || (x.store === 'ebay' && camp);
    const pic = x.image ? `<a class="tip-pic${x.slot === 'Book' || x.art ? ' is-cover' : ''}" href="${esc(url(x))}" rel="${paid ? 'sponsored noopener' : 'noopener'}" target="_blank" tabindex="-1" aria-hidden="true"><img src="${esc(x.image)}" alt="" loading="lazy"></a>` : '';
    return `<li class="tip q-${t.key}">${pic}<b class="tip-name">${esc(x.name)}</b>
<span class="tip-bind">${x.ours ? 'Made by the guild' : 'Binds when gifted'}</span>
<span class="tip-slot"><span>${esc(x.slot)}</span><span>${esc(t.band)}</span></span>
<span class="tip-use">Use: ${esc(x.use)}</span>
<p class="tip-why">"${esc(x.why)}"</p>
<span class="tip-for">For: ${esc(x.for.join(', '))}</span>
<a class="tip-go" href="${esc(url(x))}" rel="${paid ? 'sponsored noopener' : 'noopener'}" target="_blank">${STORE[x.store]}${icon('arrow-up-right')}</a></li>`;
  };
  const note = [gifts.note, tag && 'As an Amazon Associate we earn from qualifying purchases.', camp && 'eBay links are affiliate links too.'].filter(Boolean).join(' ');
  const tiers = gifts.tiers.map((t) => `<section class="loot" id="${t.key}">
<h2 class="loot-head"><span class="q-${t.key}">${esc(t.label)}</span> <small>${esc(t.band)} · ${esc(t.blurb)}</small></h2>
<ul class="tips">${gifts.gifts.filter((x) => x.tier === t.key).map((x) => tip(x, t)).join('')}</ul></section>`).join('');
  const jump = gifts.tiers.map((t) => `<a class="jump-chip q-${t.key}" href="gifts/#${t.key}">${esc(t.label)} · ${esc(t.band)}</a>`).join('');
  return simplePage({
    title: gifts.title,
    path: 'gifts/index.html',
    description: gifts.lede,
    index: true,
    cls: 'gifts',
    body: `<p class="eyebrow">Gift guide</p>
<h1 class="hero-title">${esc(gifts.title)}</h1>
<p class="hero-lead">${esc(gifts.lede)}</p>
<p class="jump">${jump}</p>
<p class="gifts-note">${esc(note)}</p>
${tiers}
<p><a class="btn btn-ghost" href="./">${icon('arrow-right')}Back to ${esc(g.tag)}</a></p>`,
  });
}

const counts = await discordCounts();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'src', 'style.css'), join(OUT, 'assets', 'style.css'));
cpSync(join(ROOT, 'src', 'app.js'), join(OUT, 'assets', 'app.js'));
cpSync(join(ROOT, 'src', 'azeroth.js'), join(OUT, 'assets', 'azeroth.js'));
cpSync(join(ROOT, 'src', 'fonts'), join(OUT, 'assets', 'fonts'), { recursive: true });
cpSync(join(ROOT, 'images'), join(OUT, 'images'), { recursive: true });
writeFileSync(join(OUT, 'index.html'), page(counts));
writeFileSync(join(OUT, '404.html'), simplePage({
  title: 'Lost in the woods',
  path: '404.html',
  body: `<p class="eyebrow">404</p>
<h1 class="hero-title">You rode off the map</h1>
<p class="hero-lead">This page doesn't exist. The road back to the guild is right here.</p>
<p><a class="btn btn-primary" href="${esc(g.site.url || './')}">${icon('arrow-right')}Back to ${esc(g.tag)}</a></p>`,
}));
writeFileSync(join(OUT, 'privacy.html'), simplePage({
  title: 'Privacy',
  path: 'privacy.html',
  body: `<h1 class="hero-title">Privacy</h1>
<p class="hero-lead">This site sets no cookies and runs no analytics or trackers.</p>
<p>Fonts and images load from this site. The animation libraries (GSAP, Lenis and three.js) load from the public jsDelivr and cdnjs networks, which see your IP address like any website you visit. The member counts are read from Discord's public invite page when the site is built, not from your browser. Links to Discord, Twitch, Instagram and other sites take you to those services, which have their own privacy policies.</p>
<p>Applying to the guild happens on Discord, so anything you send there is covered by Discord's terms and seen by the guild's officers.</p>
<p><a class="btn btn-ghost" href="./">${icon('arrow-right')}Back to ${esc(g.tag)}</a></p>`,
}));
if (gifts) {
  mkdirSync(join(OUT, 'gifts'), { recursive: true });
  writeFileSync(join(OUT, 'gifts', 'index.html'), giftsPage());
}
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`built dist/ for ${g.tag}${counts ? ` (${counts.members} members, ${counts.online} online)` : ''}: ${readdirSync(OUT).join(', ')}`);
