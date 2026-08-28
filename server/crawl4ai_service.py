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

class FallbackHTMLToMarkdown(HTMLParser):
    """Fallback HTML to Markdown converter when crawl4ai library is not installed."""
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
        # Clean up excess whitespace
        return re.sub(r'\n{3,}', '\n\n', raw).strip()

async def run_crawl4ai(url, extract_css=None, schema=None, bypass_cache=True, word_limit=None):
    try:
        from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
        
        browser_config = BrowserConfig(
            headless=True,
            verbose=False
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
                words = markdown_content.split()
                if len(words) > word_limit:
                    markdown_content = " ".join(words[:word_limit]) + f"\n\n... [Content truncated to {word_limit} words]"

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

def run_fallback(url, extract_css=None, schema=None):
    try:
        req = urllib.request.Request(
            url,
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ContextAI/1.0'}
        )
        with urllib.request.urlopen(req, timeout=12) as response:
            html = response.read().decode('utf-8', errors='ignore')
            parser = FallbackHTMLToMarkdown()
            parser.feed(html)
            markdown = parser.get_markdown()

            raw_bytes = len(html)
            markdown_bytes = len(markdown)
            saved_pct = round((1 - (markdown_bytes / max(raw_bytes, 1))) * 100, 1)

            return {
                "success": True,
                "engine": "fallback",
                "url": url,
                "title": parser.title or url,
                "markdown": markdown,
                "cleaned_html": "",
                "links": {"internal": parser.links, "external": []},
                "media": {"images": parser.images, "videos": []},
                "metadata": {"title": parser.title},
                "structured_data": None,
                "stats": {
                    "raw_bytes": raw_bytes,
                    "markdown_bytes": markdown_bytes,
                    "tokens_saved_pct": max(0.0, saved_pct),
                    "status_code": response.getcode()
                },
                "notice": "Crawl4AI python package not detected. Operating in lightweight fallback mode."
            }
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
    parser.add_argument("--bypass-cache", action="store_true", default=True, help="Bypass crawler cache")
    parser.add_argument("--status", action="store_true", help="Check python environment status")
    
    args = parser.parse_args()

    if args.status:
        print(json.dumps(check_status()))
        return

    if not args.url:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)

    result = await run_crawl4ai(args.url, extract_css=args.extract_css, schema=args.schema, bypass_cache=args.bypass_cache)
    if result is None:
        result = run_fallback(args.url, extract_css=args.extract_css, schema=args.schema)

    print(json.dumps(result, ensure_ascii=False))

if __name__ == "__main__":
    asyncio.run(main())
