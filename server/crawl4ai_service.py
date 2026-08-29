#!/usr/bin/env python3
"""
Crawl4AI Service Integration Module for Context AI Workstation
Provides high-performance web crawling, LLM markdown conversion,
structured extraction, and media link parsing.
"""

import sys
import json
import argparse
import asyncio
import re
import urllib.request
import urllib.parse
from html.parser import HTMLParser

# Ensure UTF-8 output on Windows consoles/subprocesses
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

import os

# Add server directory to sys.path to import crawler_common
_server_dir = os.path.dirname(os.path.abspath(__file__))
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

async def run_crawl4ai(url, extract_css=None, schema=None, bypass_cache=True, word_limit=None):
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
        
        browser_config = BrowserConfig(
            headless=True,
            verbose=False,
            ignore_https_errors=True
        )
        
        extraction_strategy = None
        if schema:
            try:
                schema_dict = json.loads(schema) if isinstance(schema, str) else schema
                from crawl4ai.extraction_strategy import JsonCssExtractionStrategy
                extraction_strategy = JsonCssExtractionStrategy(schema=schema_dict)
            except Exception:
                pass

        cache_mode = CacheMode.BYPASS if bypass_cache else CacheMode.ENABLED
        run_config = CrawlerRunConfig(
            cache_mode=cache_mode,
            css_selector=extract_css if extract_css and not extraction_strategy else None,
            extraction_strategy=extraction_strategy,
            word_count_threshold=10,
            remove_overlay_elements=True
        )

        async with AsyncWebCrawler(config=browser_config) as crawler:
            result = await crawler.arun(url=url, config=run_config)
            
            raw_html_len = len(result.html or "")
            markdown_content = result.markdown or ""
            if word_limit and word_limit > 0:
                markdown_content = truncate_markdown(markdown_content, word_limit)

            markdown_len = len(markdown_content)
            tokens_saved_pct = round((1 - (markdown_len / max(raw_html_len, 1))) * 100, 1)
            if tokens_saved_pct < 0:
                tokens_saved_pct = 0.0

            structured_data = None
            if (extract_css or schema) and hasattr(result, 'extracted_content') and result.extracted_content:
                try:
                    structured_data = json.loads(result.extracted_content)
                except Exception:
                    structured_data = {"raw": result.extracted_content}

            output = {
                "success": bool(result.success),
                "engine": "crawl4ai",
                "url": url,
                "title": getattr(result, 'title', None) or url,
                "markdown": markdown_content,
                "cleaned_html": getattr(result, 'cleaned_html', '') or '',
                "links": getattr(result, 'links', {}) or {"internal": [], "external": []},
                "media": getattr(result, 'media', {}) or {"images": [], "videos": []},
                "metadata": getattr(result, 'metadata', {}) or {},
                "structured_data": structured_data,
                "stats": {
                    "raw_bytes": raw_html_len,
                    "markdown_bytes": markdown_len,
                    "tokens_saved_pct": tokens_saved_pct,
                    "status_code": getattr(result, 'status_code', 200)
                },
                "error": getattr(result, 'error_message', None)
            }
            return output
    except ImportError:
        return None

def run_fallback(url, extract_css=None, schema=None, word_limit=None):
    try:
        html, status_code, final_url = fetch_url_content(url, timeout=15)
        return parse_html_to_crawl_result(
            html=html,
            url=final_url,
            status_code=status_code,
            word_limit=word_limit,
            notice="Crawl4AI python package not detected. Operating in lightweight fallback mode."
        )
    except Exception as e:
        return {
            "success": False,
            "engine": "fallback",
            "url": url,
            "error": str(e),
            "markdown": "",
            "stats": {"raw_bytes": 0, "markdown_bytes": 0, "tokens_saved_pct": 0, "status_code": 500}
        }

def check_status():
    crawl4ai_available = False
    playwright_available = False

    try:
        import crawl4ai
        crawl4ai_available = True
    except ImportError:
        pass

    try:
        import playwright
        playwright_available = True
    except ImportError:
        pass

    return {
        "crawl4ai_installed": crawl4ai_available,
        "playwright_installed": playwright_available,
        "mode": "crawl4ai" if (crawl4ai_available and playwright_available) else "fallback"
    }

async def main():
    parser = argparse.ArgumentParser(description="Context AI Crawl4AI Service")
    parser.add_argument("--url", type=str, help="Target URL to crawl")
    parser.add_argument("--extract-css", type=str, help="CSS selector for extraction")
    parser.add_argument("--schema", type=str, help="JSON schema for structured extraction")
    parser.add_argument("--word-limit", type=int, default=None, help="Word limit for markdown output")
    parser.add_argument("--bypass-cache", action="store_true", default=True, help="Bypass crawler cache")
    parser.add_argument("--status", action="store_true", help="Check python environment status")
    
    args = parser.parse_args()

    if args.status:
        print(json.dumps(check_status()))
        return

    if not args.url:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)

    result = await run_crawl4ai(args.url, extract_css=args.extract_css, schema=args.schema, bypass_cache=args.bypass_cache, word_limit=args.word_limit)
    if result is None:
        result = run_fallback(args.url, extract_css=args.extract_css, schema=args.schema, word_limit=args.word_limit)

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
