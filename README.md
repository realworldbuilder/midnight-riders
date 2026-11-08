# Guildhall

A free, open source website for your World of Warcraft guild. Edit one file, push, and GitHub builds and hosts it.

**Live example:** [<Midnight Riders>](https://realworldbuilder.github.io/midnight-riders/), an Alliance guild in WoW: Forever.

What every Guildhall site has:

- **Guild nights** in your time zone, shown in each visitor's own time too, with a live "next ride in 8h 3m" or "riding now".
- **Live Discord numbers** (members and online now), refreshed four times a day. No bot needed, just your invite link.
- **Leaders** with class colours and links to their streams and socials.
- **What members get**, **how to join** in three steps, a **gallery**, and an **FAQ** (also marked up for search engines).
- **A living 3D backdrop**: a hand-painted Azeroth zone (Teldrassil, Darkshore or the Deadmines) rendered with three.js behind the whole page, drifting with your mouse and scroll. Pick your zones in `guild.json`, or turn it off.
- **Motion that feels like a cinematic**: smooth scrolling ([Lenis](https://lenis.darkroom.engineering)), letters that rise into your guild's name, a ticking countdown, a gallery that slides sideways as you scroll down, a join timeline that draws itself, cards that tilt toward the cursor ([GSAP](https://gsap.com) + ScrollTrigger).
- **For members, not just recruits**: tonight's Discord Events in everyone's own time, big shortcut buttons that open the right Discord channel (voice, group finder, guild chat), an in game card of commands and addons, and a **crafters list** built from your crafters forum. All of it updates itself.
- One clear button for visitors: join your Discord.
- Phone friendly, no cookies, no trackers, no build tools to install. People who ask their system for reduced motion get a calm, static page.

## Make one for your guild (about 10 minutes)

1. Press **Use this template** at the top of this page and create a public repository, for example `my-guild`.
2. In your new repository open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Edit **`guild.json`** on GitHub (the pencil icon): your guild's name, faction, realm, nights, Discord invite, leaders, perks and FAQ. Set `site.url` to `https://<your-github-name>.github.io/<repository>/`.
4. Replace the pictures in **`images/`** with your own: `hero.jpg` (tall, about 4:5), one square picture per leader, gallery pictures (tall, 9:16), `og.jpg` (1200 × 630, used when the link is shared) and `favicon.png`.
5. Commit. The **Actions** tab shows the build; a minute later your site is live at the address from step 3.

Every later edit to `guild.json` or `images/` publishes itself the same way.

## guild.json at a glance

| Field | What it does |
| --- | --- |
| `name`, `tag` | Your guild's name, and how it is written in game (`<Midnight Riders>`). |
| `faction`, `realm` | Shown in the hero and the join section. Leave `realm.name` empty if you'd rather say it on Discord. |
| `accent` | One colour for icons and highlights, as a hex code. |
| `backdrop` | `{"zones": ["darkshore", "teldrassil"]}` picks the 3D zones (any of `teldrassil`, `darkshore`, `deadmines`); `false` turns the backdrop off. |
| `marquee` | Short words for the band that slides under the hero. |
| `site` | Address, page title, description and share picture. |
| `hero` | The line above the title, the sentence under it, and the big picture. |
| `discord` | Your invite link, the channel where people apply, and the button text. |
| `schedule` | Time zone ([IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `Europe/London`), its short label and how many hours a night runs. Then either `daily` (`{"start": "20:00", "plan": "…"}`, for guilds that ride every night) or `nights`, a list of set nights, each with its day, start time (24 hour) and plan. |
| `tagline` | The big sentence that lights up word by word as you scroll. |
| `steps` | How to join: cards with an icon, a title and a sentence. Icon names are the files in `src/icons/` (from [Phosphor](https://phosphoricons.com)); add any Phosphor icon there to use it. |
| `leaders` | Name, role, race, class (coloured automatically), picture, a short bio and links. |
| `discord.ids` | `server`, `category` (your guild's channel category) and `crafters` (the forum), for events, crafters and shortcut links. |
| `shortcuts` | Buttons for members: icon, label, a short line, and the Discord `channel` id they open (or a `url`). |
| `ingame` | `commands` (a command and what it does) and `addons` (name, link, one line). |
| `perks`, `tagline` | Optional extra sections for recruiting: cards and a big sentence that lights up word by word. |
| `gallery`, `faq`, `footer` | Pictures with alt text, questions and answers, and the small print. |

## Tonight's events and the crafters list (optional)

These come from your Discord through a bot that is already in your server (any bot that can see the guild's channels; no special intents).

1. Put your server, guild category and crafters forum ids in `discord.ids` (in Discord: Settings, Advanced, Developer Mode, then right click and Copy ID).
2. Give the site the bot's token one of two ways:
   - **GitHub secret** (simplest): Settings → Secrets and variables → Actions → New secret named `DISCORD_BOT_TOKEN`. The build reads Discord every time it runs. Only use a bot whose token you're happy to keep in GitHub.
   - **Your own computer**: run `DISCORD_BOT_TOKEN=... node fetch-discord.mjs` on a schedule and commit `data/discord.json` when it changes. The token never leaves your machine.
3. Officers make Events in Discord in one of the guild's voice rooms; crafters post in the forum titled `Name · what they make`.

Only public bits are written: event names, times, places and how many are going; crafter post titles and tags.

## Preview on your computer

You only need [Node.js](https://nodejs.org) 18 or newer:

```sh
node build.mjs          # writes the site to dist/
npx serve dist          # or any static server, then open the address it prints
```

`node build.mjs --offline` skips asking Discord for the member counts.

## Credits and licences

- Code: MIT (see `LICENSE`).
- Fonts: [Manrope](https://github.com/googlefonts/manrope) and [Cinzel](https://github.com/NDISCOVER/Cinzel), both SIL Open Font License, in `src/fonts/`.
- The 3D backdrop (`src/azeroth.js`): MIT, first made for [willhsu.dev](https://willhsu.dev). It loads three.js from cdnjs.
- GSAP and ScrollTrigger (free [GSAP licence](https://gsap.com/standard-license)) and Lenis (MIT) load from jsDelivr.
- Icons: [Phosphor](https://github.com/phosphor-icons/core), MIT, in `src/icons/`.
- The example pictures in `images/` belong to <Midnight Riders>. Please replace them with your own.

Guildhall is a fan project and is not made by or affiliated with Blizzard Entertainment. World of Warcraft and WoW are trademarks of Blizzard Entertainment, Inc.
