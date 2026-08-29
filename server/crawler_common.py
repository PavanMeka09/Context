"""
Shared utilities for Context AI Web Crawlers and Extractors.
Provides robust SSL handling, redirection management, HTML-to-Markdown parsing, and link classification.
"""

import sys
import re
import urllib.request
import urllib.parse
import ssl
from html.parser import HTMLParser
from typing import Optional, Dict, Any, List, Tuple

# Ensure UTF-8 output across Windows consoles and subprocesses
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')


DEFAULT_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 ContextAI/1.0',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'identity',
    'Upgrade-Insecure-Requests': '1'
}


class SmartRedirectHandler(urllib.request.HTTPRedirectHandler):
    """
    Preserves request headers across redirects while preventing host header
    contamination on cross-domain redirections.
    """
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        new_req = super().redirect_request(req, fp, code, msg, headers, newurl)
        if new_req:
            for k, v in req.headers.items():
                if k.lower() not in ('host', 'content-length', 'content-type'):
                    new_req.add_header(k, v)
            for k, v in req.unredirected_hdrs.items():
                if k.lower() not in ('host', 'content-length', 'content-type'):
                    new_req.add_header(k, v)
        return new_req


class FallbackHTMLToMarkdown(HTMLParser):
    """Fast fallback HTML-to-Markdown converter."""
    SKIP_TAGS = {'script', 'style', 'noscript', 'svg'}

    def __init__(self):
        super().__init__()
        self.result = []
        self.in_title = False
        self.skip_depth = 0
        self.title = ""
        self.links = []
        self.images = []

    def handle_starttag(self, tag, attrs):
        lower_tag = tag.lower()
        if lower_tag in self.SKIP_TAGS:
            self.skip_depth += 1
            return

        if self.skip_depth > 0:
            return

        attrs_dict = dict(attrs)
        if lower_tag == 'title':
            self.in_title = True
        elif lower_tag == 'h1':
            self.result.append('\n\n# ')
        elif lower_tag == 'h2':
            self.result.append('\n\n## ')
        elif lower_tag == 'h3':
            self.result.append('\n\n### ')
        elif lower_tag == 'p':
            self.result.append('\n\n')
        elif lower_tag == 'li':
            self.result.append('\n- ')
        elif lower_tag == 'a' and 'href' in attrs_dict:
            href = attrs_dict['href']
            self.links.append(href)
            self.result.append('[')
        elif lower_tag == 'img' and 'src' in attrs_dict:
            src = attrs_dict['src']
            alt = attrs_dict.get('alt', 'Image')
            self.images.append({'src': src, 'alt': alt})
            self.result.append(f'![{alt}]({src})')

    def handle_endtag(self, tag):
        lower_tag = tag.lower()
        if lower_tag in self.SKIP_TAGS:
            if self.skip_depth > 0:
                self.skip_depth -= 1
            return

        if self.skip_depth > 0:
            return

        if lower_tag == 'title':
            self.in_title = False
        elif lower_tag == 'a':
            self.result.append(']')

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.skip_depth > 0:
            return
        clean_text = data.strip()
        if clean_text:
            self.result.append(data)

    def get_markdown(self):
        raw = "".join(self.result)
        return re.sub(r'\n{3,}', '\n\n', raw).strip()


def create_ssl_context() -> ssl.SSLContext:
    """
    Creates an SSL context configured to bypass expired/invalid certificates
    gracefully during web crawling and data extraction.
    """
    ctx = ssl.create_default_context()
    try:
        import certifi
        ctx.load_verify_locations(certifi.where())
    except Exception:
        pass
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx


def get_url_opener() -> urllib.request.OpenerDirector:
    """Builds a urllib opener configured with SSL bypass and SmartRedirectHandler."""
    ctx = create_ssl_context()
    https_handler = urllib.request.HTTPSHandler(context=ctx)
    return urllib.request.build_opener(SmartRedirectHandler, https_handler)


def classify_links(base_url: str, raw_links: List[str]) -> Tuple[List[str], List[str]]:
    """
    Accurately classifies links into internal vs external using precise domain/subdomain matching.
    """
    parsed_base = urllib.parse.urlparse(base_url)
    base_host = (parsed_base.netloc or "").lower().split(':')[0]

    internal_links = []
    external_links = []
    seen = set()

    for link in raw_links:
        if not link or link in seen or link.startswith(('javascript:', 'mailto:', 'tel:', '#')):
            continue
        seen.add(link)
        joined = urllib.parse.urljoin(base_url, link)
        link_host = (urllib.parse.urlparse(joined).netloc or "").lower().split(':')[0]

        if base_host and (link_host == base_host or link_host.endswith('.' + base_host)):
            internal_links.append(joined)
        else:
            external_links.append(joined)

    return internal_links, external_links


def truncate_markdown(markdown: str, word_limit: Optional[int] = None) -> str:
    """Truncates markdown content cleanly to word limit if specified."""
    if not word_limit or word_limit <= 0:
        return markdown
    words = markdown.split()
    if len(words) > word_limit:
        return " ".join(words[:word_limit]) + f"\n\n... [Content truncated to {word_limit} words]"
    return markdown


def fetch_url_content(url: str, timeout: int = 15) -> Tuple[str, int, str]:
    """
    Fetches URL content using resilient headers, SSL bypass, and charset decoding.
    Returns (html_text, status_code, final_url).
    """
    req = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    opener = get_url_opener()
    with opener.open(req, timeout=timeout) as response:
        html_bytes = response.read()
        charset = response.headers.get_content_charset() or 'utf-8'
        try:
            html = html_bytes.decode(charset, errors='replace')
        except Exception:
            html = html_bytes.decode('utf-8', errors='ignore')
        final_url = response.geturl() or url
        return html, response.getcode(), final_url


def parse_html_to_crawl_result(
    html: str,
    url: str,
    status_code: int = 200,
    word_limit: Optional[int] = None,
    notice: Optional[str] = None
) -> Dict[str, Any]:
    """
    Parses HTML into a standardized CrawlResult structure matching CONTEXT.md.
    """
    parser = FallbackHTMLToMarkdown()
    try:
        parser.feed(html)
    except Exception:
        pass

    markdown = parser.get_markdown()
    if word_limit:
        markdown = truncate_markdown(markdown, word_limit)

    raw_bytes = len(html.encode('utf-8', errors='ignore'))
    markdown_bytes = len(markdown.encode('utf-8', errors='ignore'))
    saved_pct = round(max(0.0, (1 - (markdown_bytes / max(raw_bytes, 1)))) * 100, 1)

    internal_links, external_links = classify_links(url, parser.links)

    result = {
        "success": True,
        "engine": "fallback",
        "url": url,
        "title": parser.title or url,
        "markdown": markdown,
        "cleaned_html": "",
        "links": {"internal": internal_links, "external": external_links},
        "media": {"images": parser.images, "videos": []},
        "metadata": {"title": parser.title},
        "structured_data": None,
        "stats": {
            "raw_bytes": raw_bytes,
            "markdown_bytes": markdown_bytes,
            "tokens_saved_pct": saved_pct,
            "status_code": status_code
        }
    }
    if notice:
        result["notice"] = notice
    return result
