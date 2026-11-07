# Guildhall

A free, open source website for your World of Warcraft guild. Edit one file, push, and GitHub builds and hosts it.

**Live example:** [<Midnight Riders>](https://realworldbuilder.github.io/midnight-riders/), an Alliance guild in WoW: Forever.

What every Guildhall site has:

- **Guild nights** in your time zone, shown in each visitor's own time too, with a live "next ride in 8h 3m" or "riding now".
- **Live Discord numbers** (members and online now), refreshed four times a day. No bot needed, just your invite link.
- **Leaders** with class colours and links to their streams and socials.
- **What members get**, **how to join** in three steps, a **gallery**, and an **FAQ** (also marked up for search engines).
- One clear button everywhere: join your Discord.
- Phone friendly, fast, no cookies, no trackers, no build tools to install.

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
| `site` | Address, page title, description and share picture. |
| `hero` | The line above the title, the sentence under it, and the big picture. |
| `discord` | Your invite link, the channel where people apply, and the button text. |
| `schedule` | Time zone ([IANA name](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), e.g. `Europe/London`), its short label, how many hours a night runs, and each night's day, start time (24 hour) and plan. |
| `tagline` | The big sentence that lights up word by word as you scroll. |
| `perks`, `steps` | Cards with an icon, a title and a sentence. Icon names are the files in `src/icons/` (from [Phosphor](https://phosphoricons.com)); add any Phosphor icon there to use it. |
| `leaders` | Name, role, race, class (coloured automatically), picture, a short bio and links. |
| `gallery`, `faq`, `footer` | Pictures with alt text, questions and answers, and the small print. |

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
- Icons: [Phosphor](https://github.com/phosphor-icons/core), MIT, in `src/icons/`.
- The example pictures in `images/` belong to <Midnight Riders>. Please replace them with your own.

Guildhall is a fan project and is not made by or affiliated with Blizzard Entertainment. World of Warcraft and WoW are trademarks of Blizzard Entertainment, Inc.
