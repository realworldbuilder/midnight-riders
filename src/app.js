// Guildhall: smooth scroll (Lenis), scroll choreography (GSAP + ScrollTrigger), the island menu, tilt cards,
// a countdown to the next guild night, and every night shown in the visitor's own time.
// Without the libraries (offline, blocked, reduced motion) the page still works: plain reveals and a static grid.
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 861px) and (hover: hover) and (pointer: fine)').matches;
  const G = window.gsap, ST = window.ScrollTrigger;
  const motion = Boolean(G && ST && !reduce);

  // ---------------------------------------------------------------- smooth scroll + reveals
  let lenis = null;
  if (motion) {
    root.classList.add('gsap');
    G.registerPlugin(ST);
    if (window.Lenis) {
      lenis = new window.Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
      lenis.on('scroll', ST.update);
      G.ticker.add((t) => lenis.raf(t * 1000));
      G.ticker.lagSmoothing(0);
      document.querySelectorAll('a[href^="#"], a[href^="./#"]').forEach((a) => a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').replace('./', '');
        const el = id.length > 1 && document.querySelector(id);
        if (el) { e.preventDefault(); lenis.scrollTo(el, { offset: -88 }); }
      }));
    }

    // heavy fade up, batched so cards in a row arrive one after another
    G.set('.reveal', { opacity: 0, y: 64, filter: 'blur(12px)' });
    ST.batch('.reveal', {
      start: 'top 88%',
      once: true,
      onEnter: (els) => G.to(els, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.1, ease: 'expo.out', stagger: 0.09, overwrite: true }),
    });

    // hero title: letters rise out of their words
    const chars = document.querySelectorAll('.hero-title .ch');
    G.from(chars, { yPercent: 115, rotate: 8, duration: 1.3, ease: 'expo.out', stagger: 0.035, delay: 0.15 });
    // the hero art drifts slower than the page
    G.to('.hero-art img', { yPercent: 8, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });

    // tagline: each word lights as the scroll passes it
    const words = G.utils.toArray('[data-tagline] .w');
    if (words.length) {
      ST.create({
        trigger: '[data-tagline]', start: 'top 75%', end: 'bottom 45%', scrub: true,
        onUpdate: (s) => { const lit = Math.round(s.progress * words.length); words.forEach((w, i) => w.classList.toggle('on', i < lit)); },
      });
    }

    // join timeline: the line fills with the scroll
    const tl = document.querySelector('[data-timeline]');
    if (tl) {
      tl.style.setProperty('--p', 0);
      ST.create({ trigger: tl, start: 'top 70%', end: 'bottom 60%', scrub: true, onUpdate: (s) => tl.style.setProperty('--p', s.progress.toFixed(3)) });
    }

    // gallery: pin it and slide the row sideways as you scroll down (wide screens only)
    const gal = document.querySelector('[data-gallery]');
    const track = document.querySelector('[data-track]');
    if (gal && track && innerWidth > 860) {
      gal.classList.add('h');
      const distance = () => Math.max(0, track.scrollWidth - innerWidth);
      G.to(track, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: { trigger: gal, pin: '.gallery-pin', start: 'top top', end: () => `+=${distance()}`, scrub: 1, invalidateOnRefresh: true, anticipatePin: 1 },
      });
      G.from('.shot', { y: 120, opacity: 0, duration: 1.2, ease: 'expo.out', stagger: 0.06, scrollTrigger: { trigger: gal, start: 'top 70%' } });
    }

    // member counts tick up when they come into view
    document.querySelectorAll('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count), o = { v: 0 };
      G.to(o, { v: to, duration: 1.8, ease: 'power3.out', delay: 0.9, onUpdate: () => (el.textContent = Math.round(o.v).toLocaleString('en-US')) });
    });

    // the nav tucks away while scrolling down and comes back on the way up
    const nav = document.querySelector('[data-nav]');
    ST.create({ start: 120, onUpdate: (s) => nav?.classList.toggle('away', s.direction === 1 && s.scroll() > 400) });
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { rootMargin: '0px 0px -10% 0px' });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
    document.querySelectorAll('[data-tagline] .w').forEach((w) => w.classList.add('on'));
  }

  // ---------------------------------------------------------------- tilt and spotlight on cards (mouse only)
  if (desktop && !reduce) {
    document.querySelectorAll('.card').forEach((card) => card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', `${e.clientX - r.left}px`);
      card.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
    if (G) {
      document.querySelectorAll('[data-tilt]').forEach((el) => {
        const strength = el.classList.contains('hero-art') ? 10 : 5;
        G.set(el, { transformPerspective: 900 });
        const rx = G.quickTo(el, 'rotationX', { duration: 0.8, ease: 'power3.out' });
        const ry = G.quickTo(el, 'rotationY', { duration: 0.8, ease: 'power3.out' });
        el.addEventListener('pointermove', (e) => {
          const r = el.getBoundingClientRect();
          ry(((e.clientX - r.left) / r.width - 0.5) * strength * 2);
          rx(-((e.clientY - r.top) / r.height - 0.5) * strength * 2);
        });
        el.addEventListener('pointerleave', () => { rx(0); ry(0); });
      });
    }
  }

  // ---------------------------------------------------------------- island menu
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (burger && menu) {
    const set = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      if (open) { lenis?.stop(); document.body.style.overflow = 'hidden'; menu.hidden = false; requestAnimationFrame(() => menu.classList.add('open')); }
      else { lenis?.start(); document.body.style.overflow = ''; menu.classList.remove('open'); setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, 700); }
    };
    burger.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }

  // ---------------------------------------------------------------- guild nights in the visitor's time
  const sched = window.GUILD?.schedule;
  if (!sched) return;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tz = sched.timezone;
  const parts = (t, opts) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
  /** Minutes the guild's zone is ahead of UTC at instant t. */
  function offset(t) {
    const p = parts(t, { hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000) / 60000;
  }
  /** The instant of a wall clock time in the guild's zone. */
  function zoned(y, m, d, hh, mm) {
    const guess = Date.UTC(y, m, d, hh, mm);
    const t = guess - offset(guess) * 60000;
    const again = guess - offset(t) * 60000;
    return again === t ? t : again;
  }
  function starts() {
    const p = parts(Date.now(), { year: 'numeric', month: 'numeric', day: 'numeric' });
    const out = [];
    for (let ahead = -1; ahead < 8; ahead++) {
      const day = new Date(Date.UTC(p.year, p.month - 1, p.day + ahead));
      for (const n of sched.nights) {
        if (n.day !== DAYS[day.getUTCDay()]) continue;
        const [hh, mm] = n.start.split(':').map(Number);
        out.push({ night: n, t: zoned(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hh, mm) });
      }
    }
    return out.sort((a, b) => a.t - b.t);
  }
  const mine = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const local = new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  const clockFmt = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  const span = (ms) => {
    const mins = Math.max(1, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  };
  const clock = document.querySelector('[data-clock]');
  const unit = (u) => clock?.querySelector(`[data-u="${u}"]`);
  const pad = (n) => String(n).padStart(2, '0');
  let all = starts(), refreshed = Date.now();

  function tick() {
    const now = Date.now(), len = (sched.hours ?? 4) * 3600000;
    if (now - refreshed > 60000) { all = starts(); refreshed = now; }
    const live = all.find((s) => s.t <= now && now < s.t + len);
    const next = all.find((s) => s.t > now);
    if (clock) {
      const target = live ? live.t + len : next?.t;
      const left = Math.max(0, Math.floor(((target ?? now) - now) / 1000));
      unit('d').textContent = pad(Math.floor(left / 86400));
      unit('h').textContent = pad(Math.floor((left % 86400) / 3600));
      unit('m').textContent = pad(Math.floor((left % 3600) / 60));
      unit('s').textContent = pad(left % 60);
      clock.classList.toggle('live', Boolean(live));
    }
    document.querySelectorAll('.night').forEach((card) => {
      const upcoming = all.find((s) => s.night.day === card.dataset.day && s.t + len > now);
      card.classList.toggle('live', Boolean(live && live.night.day === card.dataset.day));
      const out = card.querySelector('[data-local]');
      const text = upcoming ? (mine === tz ? 'Same as your time' : `Your time: ${local.format(upcoming.t)}`) : '';
      if (out && out.textContent !== text) out.textContent = text;
    });
    const short = live ? 'Riding now' : next ? `Next ride in ${span(next.t - now)}` : 'See guild nights';
    const long = live ? `Riding now, until ${clockFmt.format(live.t + len)} your time. Join voice on Discord.` : next ? `Next ride: ${next.night.day}. Counting down` : '';
    document.querySelectorAll('[data-status]').forEach((el) => { if (el.textContent !== short) el.textContent = short; });
    document.querySelectorAll('[data-status-long]').forEach((el) => { if (long && el.textContent !== long) el.textContent = long; });
  }
  tick();
  setInterval(tick, 1000);
})();
