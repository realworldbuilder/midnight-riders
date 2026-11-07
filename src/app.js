// Guildhall: scroll reveals, the island menu, the tagline that lights word by word, and guild nights in the visitor's time.
(() => {
  document.documentElement.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Heavy fade up as things enter the viewport. IntersectionObserver only, never a scroll listener.
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }, { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // Tagline: each word lights up as it crosses a line 40% up from the bottom of the screen, in reading order.
  const words = [...document.querySelectorAll('[data-tagline] .w')];
  if (reduce) words.forEach((w) => w.classList.add('on'));
  else {
    let lit = 0;
    const line = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const i = words.indexOf(e.target);
        while (lit <= i) words[lit++].classList.add('on');
        line.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -40% 0px', threshold: 1 });
    words.forEach((w, i) => { w.style.transitionDelay = `${(i % 6) * 60}ms`; line.observe(w); });
  }

  // Island menu: hamburger morphs to an X, glass overlay, links rise in a stagger.
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (burger && menu) {
    const set = (open) => {
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.body.style.overflow = open ? 'hidden' : '';
      if (open) { menu.hidden = false; requestAnimationFrame(() => menu.classList.add('open')); }
      else { menu.classList.remove('open'); setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, 700); }
    };
    burger.addEventListener('click', () => set(burger.getAttribute('aria-expanded') !== 'true'));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    addEventListener('keydown', (e) => { if (e.key === 'Escape') set(false); });
  }

  // Guild nights: the schedule is written in the guild's time zone; show each night in the visitor's own time too.
  const sched = window.GUILD?.schedule;
  if (!sched) return;
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const tz = sched.timezone;

  /** Minutes the zone is ahead of UTC at instant t. */
  function offset(t) {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(t)).map((x) => [x.type, Number(x.value)]));
    return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - Math.floor(t / 60000) * 60000) / 60000;
  }
  /** The instant of a wall clock time in the guild's zone. */
  function zoned(y, m, d, hh, mm) {
    const guess = Date.UTC(y, m, d, hh, mm);
    let t = guess - offset(guess) * 60000;
    const again = guess - offset(t) * 60000;
    return again === t ? t : again;
  }
  /** Today's date in the guild's zone, as y, m (0 based), d. */
  function today() {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date()).map((x) => [x.type, Number(x.value)]));
    return [p.year, p.month - 1, p.day];
  }
  /** Upcoming starts (this week and next) for every night, oldest first, with the night they belong to. */
  function starts() {
    const [y, m, d] = today();
    const out = [];
    for (let ahead = -1; ahead < 8; ahead++) {
      const day = new Date(Date.UTC(y, m, d + ahead));
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
  const clock = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
  function span(ms) {
    const mins = Math.max(1, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  function tick() {
    const now = Date.now(), len = (sched.hours ?? 4) * 3600000, all = starts();
    const live = all.find((s) => s.t <= now && now < s.t + len);
    const next = all.find((s) => s.t > now);
    document.querySelectorAll('.night').forEach((card) => {
      const upcoming = all.find((s) => s.night.day === card.dataset.day && s.t + len > now);
      card.classList.toggle('live', Boolean(live && live.night.day === card.dataset.day));
      const out = card.querySelector('[data-local]');
      if (out && upcoming) out.textContent = mine === tz ? 'Same as your time' : `Your time: ${local.format(upcoming.t)}`;
    });
    const short = live ? 'Riding now' : next ? `Next ride in ${span(next.t - now)}` : 'See guild nights';
    const long = live ? `Riding now, until ${clock.format(live.t + len)} your time. Join voice on Discord.` : next ? `Next ride: ${next.night.day}, in ${span(next.t - now)}` : '';
    document.querySelectorAll('[data-status]').forEach((el) => (el.textContent = short));
    document.querySelectorAll('[data-status-long]').forEach((el) => { if (long) el.textContent = long; });
  }
  tick();
  setInterval(tick, 30000);
})();
