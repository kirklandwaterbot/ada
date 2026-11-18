# Access NYC

Which stations can you reach without stairs? Access NYC maps accessible
stations, live elevator and escalator status, and ADA construction across the
NYC subway, Staten Island Railway, PATH, both AirTrains, LIRR, Metro-North,
NJ Transit, and CTrail.

Live site: <https://nyc-ada.vercel.app>

## What's on the site

| Page | What it shows |
| --- | --- |
| **Map** (`/`) | Full-screen accessibility map with search, filters, and a card for the most recently opened station. |
| **Stations** (`/stations`) | Every station with its accessibility status, equipment snapshot, and a linked map. |
| **Equipment** (`/equipment`) | Elevators and escalators across every system, with current and planned outages. |
| **Projects** (`/projects`) | ADA capital projects and how much of each regional system is accessible. |
| **Updates** (`/updates`) | Stations that just became accessible, each with the sources that confirm it. |

## Automatic opening tracker

`scripts/sync-accessibility-news.mjs` checks for stations that have just
become accessible and updates the data on its own. The
[`accessibility-news` workflow](.github/workflows/accessibility-news.yml)
runs it every three hours and commits any changes, which redeploys the site.

**Sources**

- **MTA elevator & escalator records** from the state's open-data API
  ([data.ny.gov 94fv-bak7](https://data.ny.gov/d/94fv-bak7)). New elevators
  often show up here as in service days before the press release. Kings Hwy
  (F) was listed Aug 14, 2026, and the release came Aug 19. A station is
  marked accessible when new ADA elevators reach the platforms in both
  directions, and partially accessible for one direction. New escalators and
  replacement elevators appear in the Updates feed.
- **MTA press releases** from mta.info. The tracker reads the opening
  paragraphs, not just the headline.
- **NYC news outlets** through Google News (amNY, Gothamist, NY1, News 12,
  Patch, THE CITY, and others).
- **Reddit**: r/nyc, r/newyorkcity, r/AskNYC, and r/nycrail, plus NYC posts
  from r/Subways.

**When a station changes**

1. MTA equipment records show new ADA elevators in service to every
   platform, or an MTA, New York State, or NYC government page says the
   station is now accessible → applied right away. The earliest date wins, so
   a station gets its real in-service date even when the release comes later.
2. A recognized NYC news outlet reports it → applied.
3. A Reddit post links to one of the above → treated as that source.
4. A photo-only Reddit post → held for review until a second independent post
   or an official/news source confirms it.

When a headline doesn't name the station ("118-Year-Old Brooklyn Subway Station
Gets an ADA Makeover"), the tracker reads the start of the article through the
publisher's public WordPress API or RSS feed and finds the station there.
Publishers that offer neither are left alone and the item stays in review.
Only the article link is saved, never its text.

The tracker skips announcements of future work ("upcoming", "contract",
"breaks ground"). It also won't guess between stations that share a name:
"Kings Highway" alone matches both the F and the N, so the post must name the
line. Every opening it finds is saved in `data/accessibility-news.json` along
with its proof links. Applied changes also update
`data/accessibility-stations.json` (status, date, and a `sourceOverrides`
entry), the accessible-station map markers, and the ADA project map.

**Fixing a mistake.** Add the article URL to `rejectUrls` in
`data/accessibility-news-review.json`, or the station key to `rejectStations`.
The next run will skip it. To undo a station that was already changed, also
edit `data/accessibility-stations.json` by hand.

**Reddit reliability (optional).** Reddit often blocks anonymous requests from
GitHub's servers. Create a Reddit "script" app and add `REDDIT_CLIENT_ID` and
`REDDIT_CLIENT_SECRET` as repository secrets. Without them the tracker tries
the public JSON and RSS feeds, and if those fail it keeps going with the other
sources.

## Development

```bash
npm ci
npm run dev            # http://localhost:3000
npm test               # unit, data, and pipeline tests
npm run lint && npm run typecheck && npm run build
npm run test:e2e       # Playwright
```

Environment variables:

- `NEXT_PUBLIC_MAPBOX_TOKEN`: required for the interactive map.
- `DATABASE_URL`: optional Neon Postgres database for equipment data. Without
  it, the site uses the checked-in daily snapshot.
- `CRON_SECRET`: protects `/api/cron/sync-mta-assets`.

Data scripts:

```bash
npm run sync:news:dry  # check every news source and print what would change
npm run sync:news      # apply verified openings
npm run sync:data      # full daily sync (equipment, capital projects, regional rail, news)
```

## Design

The interface uses the subway's own wayfinding as its visual language. The
navigation is a black sign band with the white top rule. Accessibility statuses
use real route colors: 4/5/6 green for accessible, B/D/F/M orange for partial,
7 purple for planned, shuttle grey for not accessible. Text is set in
[Atkinson Hyperlegible Next](https://www.brailleinstitute.org/freefont/), the
Braille Institute's typeface for low-vision readers. It is self-hosted under
the SIL Open Font License (`src/app/fonts/OFL.txt`).
