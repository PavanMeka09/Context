"""
Persistent FastAPI Crawl4AI & Web Extraction Microservice for Context AI.
Eliminates Python process spawn cold starts by keeping parsers and browser contexts warm.
"""

import sys
import os
import re
import json
import asyncio
import urllib.request
import urllib.parse
from html.parser import HTMLParser
from typing import Optional, Dict, Any, List

try:
    from fastapi import FastAPI, HTTPException, status
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    import uvicorn
    FASTAPI_AVAILABLE = True
except ImportError:
    FASTAPI_AVAILABLE = False
    BaseModel = object
    Field = lambda **kwargs: None

# Check crawl4ai availability
CRAWL4AI_AVAILABLE = False
AsyncWebCrawler = None
CrawlerRunConfig = None
CacheMode = None

try:
    from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
    CRAWL4AI_AVAILABLE = True
except Exception:
    CRAWL4AI_AVAILABLE = False

# Check playwright availability
PLAYWRIGHT_AVAILABLE = False
try:
    import playwright
    PLAYWRIGHT_AVAILABLE = True
except Exception:
    PLAYWRIGHT_AVAILABLE = False


class FallbackHTMLToMarkdown(HTMLParser):
    """Fast fallback HTML-to-Markdown parser when Crawl4AI is not available or offline."""
    def __init__(self):
        super().__init__()
        self.result = []
        self.in_title = False
        self.title = ""
        self.links = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)
        if tag == 'title':
            self.in_title = True
        elif tag == 'h1':
            self.result.append('\n\n# ')
        elif tag == 'h2':
            self.result.append('\n\n## ')
        elif tag == 'h3':
            self.result.append('\n\n### ')
        elif tag == 'p':
            self.result.append('\n\n')
        elif tag == 'li':
            self.result.append('\n- ')
        elif tag == 'a' and 'href' in attrs_dict:
            href = attrs_dict['href']
            self.links.append(href)
            self.result.append('[')
        elif tag == 'img' and 'src' in attrs_dict:
            src = attrs_dict['src']
            alt = attrs_dict.get('alt', 'Image')
            self.images.append({'src': src, 'alt': alt})
            self.result.append(f'![{alt}]({src})')

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        elif tag == 'a':
            self.result.append(']')

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        clean_text = data.strip()
        if clean_text:
            self.result.append(data)

    def get_markdown(self):
        raw = "".join(self.result)
        return re.sub(r'\n{3,}', '\n\n', raw).strip()


async def run_crawl_fallback(url: str, extract_css: Optional[str] = None, word_limit: Optional[int] = None) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ContextAI/1.0'
        }
    )
    try:
        loop = asyncio.get_running_loop()
        def fetch():
            with urllib.request.urlopen(req, timeout=15) as response:
                html_bytes = response.read()
                charset = response.headers.get_content_charset() or 'utf-8'
                return html_bytes.decode(charset, errors='replace'), response.getcode()
        
        html_text, status_code = await loop.run_in_executor(None, fetch)
    except Exception as e:
        return {
            "success": False,
            "engine": "fallback_urllib",
            "url": url,
            "error": str(e),
            "markdown": "",
            "media": {"images": [], "videos": []},
            "links": {"internal": [], "external": []},
            "stats": {"raw_bytes": 0, "markdown_bytes": 0, "tokens_saved_pct": 0, "status_code": 500}
        }

    parser = FallbackHTMLToMarkdown()
    try:
        parser.feed(html_text)
    except Exception:
        pass

    markdown = parser.get_markdown()
    if word_limit and word_limit > 0:
        words = markdown.split()
        if len(words) > word_limit:
            markdown = " ".join(words[:word_limit]) + f"\n\n... [Content truncated to {word_limit} words]"

    raw_bytes = len(html_text.encode('utf-8'))
    md_bytes = len(markdown.encode('utf-8'))
    saved_pct = round(max(0, (1 - (md_bytes / max(raw_bytes, 1)))) * 100, 1)

    parsed_url = urllib.parse.urlparse(url)
    base_domain = parsed_url.netloc

    internal_links = []
    external_links = []
    for link in set(parser.links):
        if not link:
            continue
        joined = urllib.parse.urljoin(url, link)
        if base_domain in urllib.parse.urlparse(joined).netloc:
            internal_links.append(joined)
        else:
            external_links.append(joined)

    return {
        "success": True,
        "engine": "fallback_urllib",
        "url": url,
        "title": parser.title or url,
        "markdown": markdown,
        "media": {"images": parser.images[:20], "videos": []},
        "links": {"internal": internal_links[:30], "external": external_links[:30]},
        "stats": {
            "raw_bytes": raw_bytes,
            "markdown_bytes": md_bytes,
            "tokens_saved_pct": saved_pct,
            "status_code": status_code
        }
    }


async def run_crawl4ai_crawl(url: str, extract_css: Optional[str] = None, bypass_cache: bool = True, word_limit: Optional[int] = None) -> Dict[str, Any]:
    if not CRAWL4AI_AVAILABLE:
        return await run_crawl_fallback(url, extract_css, word_limit)

    try:
        config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED,
            css_selector=extract_css if extract_css else None,
            word_count_threshold=10,
            excluded_tags=['nav', 'footer', 'script', 'style', 'noscript', 'header', 'svg'],
            verbose=False
        )

        async with AsyncWebCrawler() as crawler:
            result = await crawler.arun(url=url, config=config)

            if not result.success:
                return await run_crawl_fallback(url, extract_css, word_limit)

            markdown = result.markdown or ""
            if word_limit and word_limit > 0:
                words = markdown.split()
                if len(words) > word_limit:
                    markdown = " ".join(words[:word_limit]) + f"\n\n... [Content truncated to {word_limit} words]"

            raw_bytes = len((result.html or "").encode('utf-8'))
            md_bytes = len(markdown.encode('utf-8'))
            saved_pct = round(max(0, (1 - (md_bytes / max(raw_bytes, 1)))) * 100, 1)

            images = []
            if hasattr(result, 'media') and isinstance(result.media, dict):
                for img in result.media.get('images', []):
                    if isinstance(img, dict):
                        images.append({'src': img.get('src', ''), 'alt': img.get('alt', '')})
                    elif isinstance(img, str):
                        images.append({'src': img, 'alt': ''})

            links_dict = {"internal": [], "external": []}
            if hasattr(result, 'links') and isinstance(result.links, dict):
                for link in result.links.get('internal', []):
                    href = link.get('href', '') if isinstance(link, dict) else str(link)
                    if href:
                        links_dict['internal'].append(href)
                for link in result.links.get('external', []):
                    href = link.get('href', '') if isinstance(link, dict) else str(link)
                    if href:
                        links_dict['external'].append(href)

            return {
                "success": True,
                "engine": "crawl4ai",
                "url": url,
                "title": result.metadata.get('title', url) if hasattr(result, 'metadata') and result.metadata else url,
                "markdown": markdown,
                "extracted_content": getattr(result, 'extracted_content', None),
                "media": {"images": images[:30], "videos": []},
                "links": links_dict,
                "stats": {
                    "raw_bytes": raw_bytes,
                    "markdown_bytes": md_bytes,
                    "tokens_saved_pct": saved_pct,
                    "status_code": getattr(result, 'status_code', 200)
                }
            }
    except Exception as e:
        fallback_res = await run_crawl_fallback(url, extract_css, word_limit)
        fallback_res["error"] = f"Crawl4AI exception, fell back to parser: {str(e)}"
        return fallback_res


if FASTAPI_AVAILABLE:
    class CrawlRequest(BaseModel):
        url: str
        extract_css: Optional[str] = Field(default=None, alias="extractCss")
        bypass_cache: Optional[bool] = Field(default=True, alias="bypassCache")
        word_limit: Optional[int] = Field(default=None, alias="wordLimit")

        class Config:
            populate_by_name = True

    class ExtractRequest(BaseModel):
        url: str
        css_selector: Optional[str] = Field(default=None, alias="cssSelector")
        schema_definition: Optional[Dict[str, Any]] = Field(default=None, alias="schema")

        class Config:
            populate_by_name = True

    app = FastAPI(title="Context AI Persistent Crawler Service", version="2.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/status")
    @app.get("/health")
    async def get_status():
        return {
            "crawl4ai_installed": CRAWL4AI_AVAILABLE,
            "playwright_installed": PLAYWRIGHT_AVAILABLE,
            "mode": "crawl4ai_service" if CRAWL4AI_AVAILABLE else "fallback_service",
            "service": "fastapi_persistent_daemon",
            "version": "2.0.0"
        }

    @app.post("/crawl")
    async def crawl_endpoint(req: CrawlRequest):
        if not req.url:
            raise HTTPException(status_code=400, detail="URL parameter is required")
        res = await run_crawl4ai_crawl(req.url, req.extract_css, req.bypass_cache if req.bypass_cache is not None else True, req.word_limit)
        return res

    @app.post("/extract")
    async def extract_endpoint(req: ExtractRequest):
        if not req.url:
            raise HTTPException(status_code=400, detail="URL parameter is required")
        extract_target = json.dumps(req.schema_definition) if req.schema_definition else req.css_selector
        res = await run_crawl4ai_crawl(req.url, extract_target, True)
        return res


if __name__ == "__main__":
    if not FASTAPI_AVAILABLE:
        print("FastAPI/Uvicorn not installed. Please install: pip install fastapi uvicorn", file=sys.stderr)
        sys.exit(1)
    port = int(os.environ.get("CRAWLER_PORT", 8083))
    host = os.environ.get("CRAWLER_HOST", "127.0.0.1")
    print(f"[Crawler Service] Starting FastAPI persistent crawler daemon on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
