# Context — Domain Glossary

This file documents the core domain terms and module concepts used across the Context codebase.

## Domain Glossary

### WebSearchEngine
A deep module that encapsulates web search intelligence for both client-facing chat and background scheduled tasks. It handles:
- Query classification heuristics (determining if search is necessary for a prompt)
- Multi-tier search execution (SearXNG primary with automatic Wikipedia fallback)
- Snippet cleaning, URL normalization, and deduplication
- Generating structured result objects (`SearchExecutionResult`) and formatted system prompt context (`SearchContext`)

### SearchContext
A clean, formatted text payload containing real-time web search results ready for direct injection into LLM system instructions (`[REAL-TIME WEB SEARCH CONTEXT]`).

### SearchExecutionResult
The structured result object returned by `WebSearchEngine.searchAndFormat()`, containing:
- `shouldSearch`: boolean flag indicating whether search was performed or bypassed
- `query`: the extracted or original search query string
- `contextText`: formatted `SearchContext` string for LLM injection
- `results`: array of normalized search hits (title, url, snippet, favicon)
- `source`: search provider used (`'searxng'`, `'wikipedia'`, `'bypassed'`, `'none'`)
- `error`: optional error details if search failed

### Crawl4AIEngine
A deep module and service layer encapsulating LLM-optimized web crawling, token reduction, and structured extraction. It handles:
- LLM markdown conversion with boilerplate and noise removal
- Structured schema extraction via typed CSS selectors or JSON schema definitions
- Dual-execution routing (FastAPI persistent daemon with graceful subprocess fallback)
- Tool definitions for autonomous ReAct agent function calling loops

### CrawlResult
The structured result object returned by `executeCrawl()`, containing:
- `success`: boolean flag indicating whether crawl and markdown conversion succeeded
- `engine`: crawler backend used (`'crawl4ai'`, `'fallback'`, `'error'`)
- `url`: target webpage URL
- `markdown`: cleaned, token-efficient markdown representation
- `extracted_content`: structured data output when CSS selector or JSON schema was requested
- `stats`: token savings and byte measurements (`raw_bytes`, `markdown_bytes`, `tokens_saved_pct`, `status_code`)
