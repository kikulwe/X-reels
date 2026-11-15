# Site Scraper

Crawl a website, extract data with CSS selectors, and download its pictures to your computer.

> This repo previously held the X Reels app. Its code is still in the git history.

## Web app (phone)

**https://kikulwe.github.io/X-reels/**

Paste a link → tap **Scrape** → tick pictures → **Save**. On a phone, Save opens the share sheet
(choose *Save to Photos* / *Save image*); on a computer, one picture downloads directly and several
download as a ZIP. Add it to your home screen to use it like an app.

The web app fetches pages through Jina Reader (renders JavaScript) and images through wsrv.nl, with public CORS proxies as backup,
so very large or protected sites may fail. For big jobs use the Python version below.

Code is in `site/`; pushes to `main` deploy automatically via `.github/workflows/pages.yml`.

## Python version (computer)

### Setup

```bash
git clone https://github.com/kikulwe/x-reels.git
cd x-reels
pip install -r requirements.txt
```

### Download pictures

```bash
# All pictures from one page -> ./downloads/<site>/
python scraper.py https://example.com --images-only

# Crawl up to 30 pages, save pictures + a CSV log of what was saved
python scraper.py https://example.com --max-pages 30 --images-only -o images.csv

# Save somewhere else, and keep small images too
python scraper.py https://example.com --images-only --images-dir ~/Pictures/scrapes --min-bytes 0
```

Finds `<img>`, lazy-loaded (`data-src`), `srcset` (largest version) and `og:image` pictures.
Skips duplicates (same file under different URLs) and tiny icons (< 5 KB by default).

### Extract data

```bash
# Page summary (title, description, text)
python scraper.py https://example.com

# Repeating items -> CSV
python scraper.py https://books.toscrape.com --max-pages 50 \
  --item "article.product_pod" \
  --field title="h3 a@title" --field price=".price_color" --field link="h3 a@href" \
  -o books.csv

# Data and pictures in one run
python scraper.py https://books.toscrape.com --max-pages 5 --item "article.product_pod" \
  --field title="h3 a@title" --images -o books.csv
```

`--field name="selector"` takes text; `name="selector@attr"` takes an attribute.

### Options

| Option | Default | What it does |
|---|---|---|
| `--max-pages` | 1 | Pages to fetch |
| `--depth` | 3 | How many links deep to follow |
| `--follow REGEX` | – | Only follow matching links |
| `--images` / `--images-only` | off | Download pictures (with / instead of data) |
| `--images-dir` | `downloads` | Picture folder |
| `--min-bytes` | 5000 | Skip smaller images |
| `--delay` | 1.0 | Seconds between requests |
| `-o FILE` | stdout | `.csv` or `.json` output |
| `--ignore-robots` | off | Skip robots.txt check |

Stays on the starting domain. Doesn't run JavaScript, so content loaded by JS won't be seen.
Respect each site's terms and copyright.
