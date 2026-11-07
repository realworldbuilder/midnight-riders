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
  const links = [['#nights', 'Guild nights'], ['#leaders', 'Leaders'], ['#join', 'How to join'], ['#faq', 'FAQ']];
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
    <p class="footer-brand">${esc(g.tag)}</p>
    <ul class="footer-links">
      <li><a href="${esc(g.discord.invite)}" rel="noopener">Discord</a></li>
      <li><a href="privacy.html">Privacy</a></li>
      <li><a href="https://github.com/realworldbuilder/guildhall" rel="noopener">Made with Guildhall</a></li>
    </ul>
  </div>
  <p class="wrap footer-note">${esc(g.footer?.note ?? '')}</p>
</footer>`;
}

const reveal = (html, tag = 'div', cls = '') => `<${tag} class="reveal ${cls}">${html}</${tag}>`;

function page(counts) {
  const sched = g.schedule;
  const proof = counts
    ? `<p class="proof">${icon('users-three')}<span><strong>${counts.members.toLocaleString('en-US')}</strong> on the Discord · <strong>${counts.online.toLocaleString('en-US')}</strong> online now</span></p>`
    : `<p class="proof">${icon('moon-stars')}<span>${esc(g.faction)} · ${esc(g.realm.type)} · ${esc(g.realm.region)}</span></p>`;

  const nights = sched.nights.map((n) => `
      <li class="card night reveal" data-day="${esc(n.day)}" data-start="${esc(n.start)}">
        <p class="night-day">${icon('calendar-dots')}${esc(n.day)}</p>
        <p class="night-time">${esc(fmt12(n.start))} ${esc(sched.zoneLabel)}</p>
        <p class="night-local" data-local aria-live="polite"></p>
        <p class="night-plan">${esc(n.plan)}</p>
      </li>`).join('');

  const perks = g.perks.map((p) => `
      <li class="card perk reveal">${icon(p.icon, 'icon icon-lg')}<h3>${esc(p.title)}</h3><p>${esc(p.text)}</p></li>`).join('');

  const leaders = g.leaders.map((l) => `
      <article class="card leader reveal">
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
      <li class="card step reveal"><p class="step-n">${i + 1}</p>${icon(s.icon, 'icon icon-lg')}<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p></li>`).join('');

  const gallery = g.gallery.map((p) => `<li><img src="${esc(p.image)}" alt="${esc(p.alt)}" width="640" height="1147" loading="lazy"></li>`).join('');

  const faq = g.faq.map((f) => `
      <details class="card faq-item reveal"><summary><span>${esc(f.q)}</span>${icon('plus')}</summary><p>${esc(f.a)}</p></details>`).join('');

  const tagline = g.tagline.split(/\s+/).map((w) => `<span class="w">${esc(w)}</span>`).join(' ');
  const cta = (cls = '') => `<a class="btn btn-primary ${cls}" href="${esc(g.discord.invite)}" rel="noopener">${icon('discord-logo')}${esc(g.discord.cta ?? 'Join on Discord')}</a>`;

  const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };

  return `<!doctype html>
<html lang="en">
<head>
${head({ title: g.site.title, description: g.site.description })}
<script type="application/ld+json">${JSON.stringify(faqLd).replace(/</g, '\\u003c')}</script>
</head>
<body>
${nav()}
<main id="main">
  <section class="hero wrap">
    <div class="hero-copy">
      <p class="eyebrow reveal">${esc(g.hero.eyebrow)}</p>
      <h1 class="hero-title reveal">${esc(g.tag)}</h1>
      <p class="hero-lead reveal">${esc(g.hero.lead)}</p>
      <div class="hero-actions reveal">${cta()}<a class="btn btn-ghost" href="#nights">${icon('clock')}<span data-status>See guild nights</span></a></div>
      ${reveal(proof)}
    </div>
    <figure class="hero-art reveal"><img src="${esc(g.hero.image)}" alt="${esc(g.hero.alt)}" width="960" height="1720" fetchpriority="high"></figure>
  </section>

  <section class="section wrap" id="nights" aria-labelledby="nights-h">
    <div class="section-head reveal">
      <h2 id="nights-h">Guild nights</h2>
      <p class="status" data-status-long aria-live="polite">${esc(sched.nights.map((n) => n.day).join(', '))} from ${esc(fmt12(sched.nights[0].start))} ${esc(sched.zoneLabel)}</p>
    </div>
    <ul class="grid grid-3">${nights}
    </ul>
  </section>

  <section class="tagline wrap" aria-label="What we're about">
    <p class="tagline-text" data-tagline>${tagline}</p>
  </section>

  <section class="section wrap" id="perks" aria-labelledby="perks-h">
    <div class="section-head reveal"><h2 id="perks-h">What riding with us gets you</h2></div>
    <ul class="grid grid-3">${perks}
    </ul>
  </section>

  <section class="section wrap" id="leaders" aria-labelledby="leaders-h">
    <div class="section-head reveal"><h2 id="leaders-h">Who leads the ride</h2></div>
    <div class="grid grid-2">${leaders}
    </div>
  </section>

  <section class="section wrap" id="join" aria-labelledby="join-h">
    <div class="section-head reveal"><h2 id="join-h">How to join</h2><p>${esc(g.faction)} only, ${esc(g.realm.type.toLowerCase().replace('normal (pve)', 'normal PvE'))} realm${g.realm.name ? ` <strong>${esc(g.realm.name)}</strong>` : ''}.</p></div>
    <ol class="grid grid-3">${steps}
    </ol>
  </section>

  <section class="section" id="gallery" aria-labelledby="gallery-h">
    <div class="section-head wrap reveal"><h2 id="gallery-h">From the stable</h2></div>
    <ul class="strip" tabindex="0" aria-label="Guild art, scroll sideways">${gallery}</ul>
  </section>

  <section class="section wrap" id="faq" aria-labelledby="faq-h">
    <div class="section-head reveal"><h2 id="faq-h">Questions</h2></div>
    <div class="faq">${faq}
    </div>
  </section>

  <section class="section wrap final reveal" aria-labelledby="final-h">
    <h2 id="final-h">There's a saddle with your name on it</h2>
    <p>Join the Discord, press Apply in ${esc(g.discord.applyChannel)}, and ride with us on the next guild night.</p>
    ${cta()}
  </section>
</main>
${footer()}
<script>window.GUILD=${JSON.stringify({ schedule: sched }).replace(/</g, '\\u003c')}</script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

function simplePage({ title, path, body }) {
  return `<!doctype html>
<html lang="en">
<head>
${head({ title: `${title} · ${g.tag}`, description: g.site.description, path })}
<meta name="robots" content="noindex">
</head>
<body>
${nav('sub')}
<main id="main" class="wrap simple">
${body}
</main>
${footer()}
<script>window.GUILD=${JSON.stringify({ schedule: g.schedule }).replace(/</g, '\\u003c')}</script>
<script src="assets/app.js" defer></script>
</body>
</html>
`;
}

function fmt12(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

const counts = await discordCounts();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'assets'), { recursive: true });
cpSync(join(ROOT, 'src', 'style.css'), join(OUT, 'assets', 'style.css'));
cpSync(join(ROOT, 'src', 'app.js'), join(OUT, 'assets', 'app.js'));
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
<p>Every font, image and script loads from this site. The member counts are read from Discord's public invite page when the site is built, not from your browser. Links to Discord, Twitch, Instagram and other sites take you to those services, which have their own privacy policies.</p>
<p>Applying to the guild happens on Discord, so anything you send there is covered by Discord's terms and seen by the guild's officers.</p>
<p><a class="btn btn-ghost" href="./">${icon('arrow-right')}Back to ${esc(g.tag)}</a></p>`,
}));
writeFileSync(join(OUT, '.nojekyll'), '');
console.log(`built dist/ for ${g.tag}${counts ? ` (${counts.members} members, ${counts.online} online)` : ''}: ${readdirSync(OUT).join(', ')}`);
