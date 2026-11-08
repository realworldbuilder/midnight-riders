#!/usr/bin/env node
// Guildhall: reads your guild's Discord Events and crafter posts into data/discord.json, which build.mjs shows on the site.
//
//   DISCORD_BOT_TOKEN=... node fetch-discord.mjs
//
// Needs a bot in your server that can see the guild's channels (no privileged intents). Only public bits are written:
// event names, times, places and "interested" counts; crafter post titles and their tags. Run it wherever the token is
// safe: a GitHub Actions secret, or a scheduled job on your own computer that commits data/discord.json when it changes.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(ROOT, 'guild.json'), 'utf8'));
const ids = g.discord?.ids ?? {};
const token = process.env.DISCORD_BOT_TOKEN;
if (!token || !ids.server) {
  console.log('fetch-discord: skipped (needs DISCORD_BOT_TOKEN and discord.ids.server in guild.json)');
  process.exit(0);
}

async function api(path) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://discord.com/api/v10${path}`, { headers: { Authorization: `Bot ${token}` }, signal: AbortSignal.timeout(10000) });
    if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error(`${res.status} on ${path}`);
    return res.json();
  }
  throw new Error(`rate limited on ${path}`);
}

const channels = await api(`/guilds/${ids.server}/channels`);
const inSection = new Set(channels.filter((c) => !ids.category || c.parent_id === ids.category).map((c) => c.id));
const nameOf = Object.fromEntries(channels.map((c) => [c.id, c.name]));

// Events: the guild's own (held in one of its channels, or naming the guild), from an hour ago to a week ahead.
const now = Date.now();
const events = (await api(`/guilds/${ids.server}/scheduled-events?with_user_count=true`))
  .filter((e) => e.status === 1 || e.status === 2)
  .filter((e) => !ids.category || inSection.has(e.channel_id) || `${e.name} ${e.description ?? ''} ${e.entity_metadata?.location ?? ''}`.toLowerCase().includes(g.name.toLowerCase()))
  .map((e) => ({
    name: e.name,
    description: (e.description ?? '').slice(0, 200),
    start: e.scheduled_start_time,
    end: e.scheduled_end_time ?? new Date(Date.parse(e.scheduled_start_time) + 2 * 3600000).toISOString(),
    where: e.channel_id ? nameOf[e.channel_id] ?? '' : e.entity_metadata?.location ?? '',
    going: e.user_count ?? 0,
    live: e.status === 2,
    url: `https://discord.com/events/${ids.server}/${e.id}`,
  }))
  .filter((e) => Date.parse(e.end) > now - 3600000 && Date.parse(e.start) < now + 7 * 86400000)
  .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));

// Crafters: one forum post each, titled "Name · what they make"; the post's tags count as professions too.
let crafters = [];
if (ids.crafters) {
  const forum = channels.find((c) => c.id === ids.crafters);
  const tagName = Object.fromEntries((forum?.available_tags ?? []).map((t) => [t.id, t.name]));
  const active = (await api(`/guilds/${ids.server}/threads/active`)).threads.filter((t) => t.parent_id === ids.crafters);
  const archived = (await api(`/channels/${ids.crafters}/threads/archived/public?limit=100`)).threads ?? [];
  const seen = new Set();
  for (const t of [...active, ...archived]) {
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    const tags = (t.applied_tags ?? []).map((id) => tagName[id]).filter((n) => n && !/^(request|guild bank)$/i.test(n));
    if ((t.applied_tags ?? []).some((id) => /^(request|guild bank)$/i.test(tagName[id] ?? ''))) continue; // asks, not crafters
    const [who, ...rest] = t.name.split(/\s*[·|:—–]\s*|\s+-\s+/);
    const makes = rest.join(', ').trim();
    crafters.push({ name: who.trim(), makes: makes || tags.join(', '), tags, url: `https://discord.com/channels/${ids.server}/${t.id}` });
  }
  crafters.sort((a, b) => a.name.localeCompare(b.name));
}

const out = { events, crafters };
const file = join(ROOT, 'data', 'discord.json');
const before = existsSync(file) ? readFileSync(file, 'utf8') : '';
const text = `${JSON.stringify(out, null, 1)}\n`;
mkdirSync(dirname(file), { recursive: true });
if (text !== before) writeFileSync(file, text);
console.log(`fetch-discord: ${events.length} events, ${crafters.length} crafters${text === before ? ' (no change)' : ' (written)'}`);
