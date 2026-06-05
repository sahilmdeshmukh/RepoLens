import uuid
import asyncio
from urllib.parse import urlparse, urljoin
from playwright.async_api import async_playwright
from bs4 import BeautifulSoup
from app.ingestion.chunker import chunk_html
from app.ingestion.embedder import embed_texts
from app.db.sqlite import insert_chunk, update_source_status
from app.db.qdrant import get_qdrant, COLLECTION_NAME
from qdrant_client.models import PointStruct

MAX_PAGES = 50  # cap to avoid runaway crawls on huge doc sites


async def _crawl_site(base_url: str) -> list[dict]:
    """
    Crawl all pages under the same domain as base_url using a headless browser.

    WHY Playwright directly instead of crawl4ai: crawl4ai requires lxml which
    doesn't have a Python 3.14 wheel yet. Playwright is already installed and
    gives us the same capability — a real headless Chromium browser that runs
    JavaScript and returns fully rendered HTML.

    Returns a list of {url, html} dicts, one per crawled page.
    """
    parsed = urlparse(base_url)
    domain = f"{parsed.scheme}://{parsed.netloc}"

    pages = []
    visited = set()
    queue = [base_url]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        while queue and len(visited) < MAX_PAGES:
            url = queue.pop(0)
            if url in visited:
                continue
            visited.add(url)

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                html = await page.content()
                pages.append({"url": url, "html": html})

                # Extract all internal links from the page
                soup = BeautifulSoup(html, "html.parser")
                for tag in soup.find_all("a", href=True):
                    href = urljoin(url, tag["href"]).split("#")[0]  # strip anchors
                    if href.startswith(domain) and href not in visited:
                        queue.append(href)
            except Exception:
                continue  # skip pages that fail to load

        await browser.close()

    return pages

    return pages


def ingest_api_docs(source_id: str, docs_url: str):
    """
    Full pipeline: crawl site → chunk HTML → embed → store.

    WHY asyncio.run(): crawl4ai is async (uses Playwright under the hood),
    but FastAPI's BackgroundTasks runs in a thread pool. asyncio.run() creates
    a new event loop in that thread so we can run async code from sync context.
    """
    try:
        update_source_status(source_id, "processing")

        pages = asyncio.run(_crawl_site(docs_url))

        all_chunks = []
        for page in pages:
            raw_chunks = chunk_html(page["html"])
            for raw in raw_chunks:
                chunk_id = str(uuid.uuid4())
                metadata = {
                    "source": "api_docs",
                    "base_url": docs_url,
                    "page_url": page["url"],
                    "section_title": raw["text"].split("\n")[0][:100],
                    "chunk_type": raw["chunk_type"],
                }
                all_chunks.append({
                    "id": chunk_id,
                    "source_id": source_id,
                    "text": raw["text"],
                    "metadata": metadata,
                })

        if not all_chunks:
            update_source_status(source_id, "failed", error="No content extracted from docs")
            return

        texts = [c["text"] for c in all_chunks]
        embeddings = embed_texts(texts)

        qdrant = get_qdrant()
        points = [
            PointStruct(
                id=c["id"],
                vector=emb,
                payload={**c["metadata"], "source_id": source_id, "text": c["text"]},
            )
            for c, emb in zip(all_chunks, embeddings)
        ]
        qdrant.upsert(collection_name=COLLECTION_NAME, points=points)

        for chunk in all_chunks:
            insert_chunk(chunk)

        update_source_status(source_id, "complete", chunk_count=len(all_chunks))

    except Exception as e:
        update_source_status(source_id, "failed", error=str(e))
        raise
