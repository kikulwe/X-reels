#!/usr/bin/env python3
"""
Site Scraper — crawl a website and extract data with CSS selectors.

Install:
    pip install requests beautifulsoup4

Examples:
    # Grab title + all text from one page
    python scraper.py https://example.com

    # Crawl up to 50 pages on the same domain, extract fields, save CSV
    python scraper.py https://books.toscrape.com --max-pages 50 \
        --item "article.product_pod" \
        --field title="h3 a@title" --field price=".price_color" --field link="h3 a@href" \
        -o books.csv

    # Only follow links matching a pattern
    python scraper.py https://site.com --follow "/blog/" --max-pages 100 -o posts.json

    # Download every picture from up to 20 pages into ./downloads/<domain>/
    python scraper.py https://site.com --max-pages 20 --images-only -o images.csv

Field syntax:  name="css selector"        -> element text
               name="css selector@attr"   -> attribute value (href/src are made absolute)
"""
import argparse
import csv
import hashlib
import json
import os
import re
import sys
import time
from collections import deque
from urllib import robotparser
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (compatible; SiteScraper/1.0)"


def parse_fields(raw):
    fields = {}
    for f in raw or []:
        if "=" not in f:
            sys.exit(f"Bad --field '{f}'. Use name=\"selector\" or name=\"selector@attr\"")
        name, sel = f.split("=", 1)
        attr = None
        if "@" in sel:
            sel, attr = sel.rsplit("@", 1)
        fields[name.strip()] = (sel.strip(), attr)
    return fields


def extract_value(scope, sel, attr, base_url):
    el = scope.select_one(sel) if sel else scope
    if el is None:
        return ""
    if attr:
        val = el.get(attr, "")
        if attr in ("href", "src") and val:
            val = urljoin(base_url, val)
        return val.strip() if isinstance(val, str) else " ".join(val)
    return el.get_text(" ", strip=True)


def scrape_page(url, soup, item_sel, fields):
    if not fields:  # default: page summary
        title = soup.title.get_text(strip=True) if soup.title else ""
        desc = soup.find("meta", attrs={"name": "description"})
        body = soup.body.get_text(" ", strip=True) if soup.body else ""
        return [{
            "url": url,
            "title": title,
            "description": desc.get("content", "") if desc else "",
            "h1": " | ".join(h.get_text(strip=True) for h in soup.find_all("h1")),
            "text": body[:5000],
        }]
    scopes = soup.select(item_sel) if item_sel else [soup]
    rows = []
    for scope in scopes:
        row = {"url": url}
        for name, (sel, attr) in fields.items():
            row[name] = extract_value(scope, sel, attr, url)
        rows.append(row)
    return rows


IMG_EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif",
           "image/webp": ".webp", "image/svg+xml": ".svg", "image/avif": ".avif"}


def find_image_urls(soup, base_url):
    urls = []
    for img in soup.find_all(["img", "source"]):
        for attr in ("src", "data-src", "data-lazy-src", "data-original"):
            if img.get(attr):
                urls.append(img[attr])
        srcset = img.get("srcset") or img.get("data-srcset")
        if srcset:  # take the largest candidate (last one)
            urls.append(srcset.split(",")[-1].strip().split(" ")[0])
    for meta in soup.find_all("meta", attrs={"property": ["og:image", "twitter:image"]}):
        if meta.get("content"):
            urls.append(meta["content"])
    out = []
    for u in urls:
        if u.startswith("data:"):
            continue
        full = urldefrag(urljoin(base_url, u))[0]
        if full.startswith(("http://", "https://")) and full not in out:
            out.append(full)
    return out


def safe_name(url):
    p = urlparse(url)
    name = os.path.basename(p.path) or "image"
    name = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80]
    return name


class ImageDownloader:
    def __init__(self, session, folder, min_bytes, timeout):
        self.session, self.folder = session, folder
        self.min_bytes, self.timeout = min_bytes, timeout
        self.done_urls, self.hashes = set(), set()
        self.count = 0
        os.makedirs(folder, exist_ok=True)

    def get(self, url):
        if url in self.done_urls:
            return ""
        self.done_urls.add(url)
        try:
            r = self.session.get(url, timeout=self.timeout)
        except requests.RequestException as e:
            print(f"  [img error] {url}: {e}", file=sys.stderr)
            return ""
        ctype = r.headers.get("Content-Type", "").split(";")[0].strip()
        if not r.ok or not ctype.startswith("image/") or len(r.content) < self.min_bytes:
            return ""
        digest = hashlib.sha1(r.content).hexdigest()
        if digest in self.hashes:  # same picture under another URL
            return ""
        self.hashes.add(digest)
        name = safe_name(url)
        root, ext = os.path.splitext(name)
        if not ext:
            ext = IMG_EXT.get(ctype, ".img")
        path = os.path.join(self.folder, f"{root}_{digest[:8]}{ext}")
        with open(path, "wb") as f:
            f.write(r.content)
        self.count += 1
        print(f"  [img {self.count}] {path}", file=sys.stderr)
        return path


def crawl(args):
    start = args.url
    domain = urlparse(start).netloc
    fields = parse_fields(args.field)
    follow_re = re.compile(args.follow) if args.follow else None

    session = requests.Session()
    session.headers["User-Agent"] = args.user_agent

    rp = None
    if not args.ignore_robots:
        rp = robotparser.RobotFileParser()
        try:
            r = session.get(urljoin(start, "/robots.txt"), timeout=args.timeout)
            rp.parse(r.text.splitlines() if r.ok else [])
        except requests.RequestException:
            rp.parse([])

    images = None
    if args.images:
        folder = os.path.join(args.images_dir, re.sub(r"[^A-Za-z0-9.-]", "_", domain))
        images = ImageDownloader(session, folder, args.min_bytes, args.timeout)

    queue = deque([(start, 0)])
    seen = {start}
    results, pages = [], 0

    while queue and pages < args.max_pages:
        url, depth = queue.popleft()
        if rp and not rp.can_fetch(args.user_agent, url):
            print(f"[robots] skip {url}", file=sys.stderr)
            continue
        try:
            resp = session.get(url, timeout=args.timeout)
        except requests.RequestException as e:
            print(f"[error] {url}: {e}", file=sys.stderr)
            continue
        pages += 1
        ctype = resp.headers.get("Content-Type", "")
        print(f"[{pages}] {resp.status_code} {url}", file=sys.stderr)
        if not resp.ok or "html" not in ctype:
            continue

        soup = BeautifulSoup(resp.text, "html.parser")
        if not args.images_only:
            results.extend(scrape_page(url, soup, args.item, fields))
        if images:
            for img_url in find_image_urls(soup, url):
                path = images.get(img_url)
                if path and args.images_only:
                    results.append({"url": url, "image_url": img_url, "saved_to": path})

        if depth < args.depth:
            for a in soup.find_all("a", href=True):
                link = urldefrag(urljoin(url, a["href"]))[0]
                p = urlparse(link)
                if p.scheme not in ("http", "https") or p.netloc != domain:
                    continue
                if follow_re and not follow_re.search(link):
                    continue
                if link not in seen:
                    seen.add(link)
                    queue.append((link, depth + 1))
        time.sleep(args.delay)

    if images:
        print(f"Downloaded {images.count} images -> {images.folder}", file=sys.stderr)
    return results


def save(rows, out):
    if not out:
        print(json.dumps(rows, indent=2, ensure_ascii=False))
        return
    if out.endswith(".csv"):
        keys = list(dict.fromkeys(k for r in rows for k in r))
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=keys)
            w.writeheader()
            w.writerows(rows)
    else:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2, ensure_ascii=False)
    print(f"Saved {len(rows)} rows -> {out}", file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description="Crawl a site and extract data.")
    ap.add_argument("url", help="Start URL")
    ap.add_argument("--max-pages", type=int, default=1, help="Max pages to fetch (default 1)")
    ap.add_argument("--depth", type=int, default=3, help="Max link depth from start (default 3)")
    ap.add_argument("--follow", help="Regex: only follow links matching this")
    ap.add_argument("--item", help="CSS selector for repeating items (e.g. a product card)")
    ap.add_argument("--field", action="append", help='name="selector[@attr]" (repeatable)')
    ap.add_argument("-o", "--out", help="Output file (.csv or .json). Default: print JSON")
    ap.add_argument("--delay", type=float, default=1.0, help="Seconds between requests (default 1)")
    ap.add_argument("--timeout", type=float, default=15)
    ap.add_argument("--user-agent", default=UA)
    ap.add_argument("--ignore-robots", action="store_true", help="Don't check robots.txt")
    ap.add_argument("--images", action="store_true", help="Download pictures found on each page")
    ap.add_argument("--images-only", action="store_true", help="Only download pictures (implies --images)")
    ap.add_argument("--images-dir", default="downloads", help="Where to save pictures (default ./downloads)")
    ap.add_argument("--min-bytes", type=int, default=5000,
                    help="Skip images smaller than this, e.g. icons (default 5000)")
    args = ap.parse_args()
    if args.images_only:
        args.images = True
    save(crawl(args), args.out)


if __name__ == "__main__":
    main()
