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
BrowserConfig = None
CrawlerRunConfig = None
CacheMode = None

try:
    from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
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

# Add server directory to sys.path to import crawler_common
_server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _server_dir not in sys.path:
    sys.path.insert(0, _server_dir)

from crawler_common import (
    DEFAULT_HEADERS,
    create_ssl_context,
    get_url_opener,
    classify_links,
    truncate_markdown,
    fetch_url_content,
    parse_html_to_crawl_result,
    FallbackHTMLToMarkdown
)


async def run_crawl_fallback(url: str, extract_css: Optional[str] = None, word_limit: Optional[int] = None) -> Dict[str, Any]:
    try:
        loop = asyncio.get_running_loop()
        def fetch():
            return fetch_url_content(url, timeout=15)
        
        html_text, status_code, final_url = await loop.run_in_executor(None, fetch)
        return parse_html_to_crawl_result(
            html=html_text,
            url=final_url,
            status_code=status_code,
            word_limit=word_limit
        )
    except Exception as e:
        return {
            "success": False,
            "engine": "fallback",
            "url": url,
            "error": str(e),
            "markdown": "",
            "media": {"images": [], "videos": []},
            "links": {"internal": [], "external": []},
            "stats": {"raw_bytes": 0, "markdown_bytes": 0, "tokens_saved_pct": 0, "status_code": 500}
        }


async def run_crawl4ai_crawl(
    url: str,
    extract_css: Optional[str] = None,
    schema_definition: Optional[Dict[str, Any]] = None,
    bypass_cache: bool = True,
    word_limit: Optional[int] = None
) -> Dict[str, Any]:
    if not CRAWL4AI_AVAILABLE:
        return await run_crawl_fallback(url, extract_css, word_limit)

    try:
        extraction_strategy = None
        if schema_definition:
            try:
                from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
                extraction_strategy = JsonCssExtractionStrategy(schema=schema_definition)
            except Exception:
                pass

        config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED,
            css_selector=extract_css if extract_css and not extraction_strategy else None,
            extraction_strategy=extraction_strategy,
            word_count_threshold=10,
            excluded_tags=['nav', 'footer', 'script', 'style', 'noscript', 'header', 'svg'],
            verbose=False
        )

        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            ignore_https_errors=True
        ) if BrowserConfig else None

        async with (AsyncWebCrawler(config=browser_config) if browser_config else AsyncWebCrawler()) as crawler:
            result = await crawler.arun(url=url, config=config)

            if not result.success:
                return await run_crawl_fallback(url, extract_css, word_limit)

            markdown = result.markdown or ""
            if word_limit and word_limit > 0:
                markdown = truncate_markdown(markdown, word_limit)

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
                "media": {"images": images, "videos": []},
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
        schema_definition: Optional[Dict[str, Any]] = Field(default=None, alias="schema")
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
        res = await run_crawl4ai_crawl(
            req.url,
            extract_css=req.extract_css,
            schema_definition=req.schema_definition,
            bypass_cache=req.bypass_cache if req.bypass_cache is not None else True,
            word_limit=req.word_limit
        )
        return res

    @app.post("/extract")
    async def extract_endpoint(req: ExtractRequest):
        if not req.url:
            raise HTTPException(status_code=400, detail="URL parameter is required")
        res = await run_crawl4ai_crawl(
            req.url,
            extract_css=req.css_selector,
            schema_definition=req.schema_definition,
            bypass_cache=True
        )
        return res


if __name__ == "__main__":
    if not FASTAPI_AVAILABLE:
        print("FastAPI/Uvicorn not installed. Please install: pip install fastapi uvicorn", file=sys.stderr)
        sys.exit(1)
    port = int(os.environ.get("CRAWLER_PORT", 8083))
    host = os.environ.get("CRAWLER_HOST", "127.0.0.1")
    print(f"[Crawler Service] Starting FastAPI persistent crawler daemon on http://{host}:{port}")
    uvicorn.run(app, host=host, port=port, log_level="info")
