import re
from tree_sitter import Language, Parser, Node
import tree_sitter_python as tspython
import tree_sitter_javascript as tsjavascript
import tree_sitter_typescript as tstypescript
import tree_sitter_go as tsgo
from bs4 import BeautifulSoup

# Build language objects once at module load — parsing is expensive, don't repeat it per call
_LANGUAGES: dict[str, Language] = {
    "python": Language(tspython.language()),
    "javascript": Language(tsjavascript.language()),
    "typescript": Language(tstypescript.language_typescript()),
    "tsx": Language(tstypescript.language_tsx()),
    "go": Language(tsgo.language()),
}

# Node types to extract per language — each language's grammar uses different names
_TARGET_TYPES: dict[str, dict[str, str]] = {
    "python":     {"function_definition": "function", "class_definition": "class"},
    "javascript": {"function_declaration": "function", "class_declaration": "class", "method_definition": "function"},
    "typescript": {"function_declaration": "function", "class_declaration": "class", "method_definition": "function"},
    "tsx":        {"function_declaration": "function", "class_declaration": "class", "method_definition": "function"},
    "go":         {"function_declaration": "function", "method_declaration": "function"},
}

MAX_CHUNK_CHARS = 2000  # ~500 tokens — keeps chunks small enough to fit many in the prompt


def _collect_nodes(node: Node, target_types: dict[str, str], results: list, inside_target: bool = False):
    """
    Recursively walk the AST and collect nodes whose type matches our targets.
    Skips nested targets — a method inside a class is covered by the class chunk.

    WHY skip nested: if we capture both a class and its methods, we'd have
    overlapping chunks. The class chunk already contains all the methods,
    so extracting methods separately would be redundant and confusing for retrieval.
    """
    if node.type in target_types:
        if not inside_target:
            results.append((node, target_types[node.type]))
        inside_target = True  # don't capture children of this node
    for child in node.children:
        _collect_nodes(child, target_types, results, inside_target)


def chunk_code(source: str, language: str) -> list[dict]:
    """
    Split source code into chunks at function/class boundaries using tree-sitter.

    WHY tree-sitter: it builds a full syntax tree of the code, giving us exact
    byte positions of every function and class. We can extract them as complete,
    meaningful units instead of arbitrary character slices.

    Falls back to line-window chunking for unsupported languages.
    """
    lang = _LANGUAGES.get(language)
    target_types = _TARGET_TYPES.get(language)
    if lang is None or target_types is None:
        return _fallback_line_chunks(source)

    parser = Parser(lang)
    tree = parser.parse(bytes(source, "utf8"))

    collected = []
    _collect_nodes(tree.root_node, target_types, collected)

    chunks = []
    seen_ranges = set()

    for node, capture_name in collected:
        key = (node.start_byte, node.end_byte)
        if key in seen_ranges:
            continue  # avoid duplicates (e.g. method inside a class captured twice)
        seen_ranges.add(key)

        text = source[node.start_byte:node.end_byte]
        if len(text) > MAX_CHUNK_CHARS:
            text = text[:MAX_CHUNK_CHARS]

        chunks.append({
            "text": text,
            "start_line": node.start_point[0] + 1,  # tree-sitter is 0-indexed, we want 1-indexed
            "end_line": node.end_point[0] + 1,
            "chunk_type": capture_name,  # "function" or "class"
        })

    return chunks if chunks else _fallback_line_chunks(source)


def _fallback_line_chunks(source: str) -> list[dict]:
    """Chunk by sliding window of lines when AST parsing isn't available."""
    lines = source.splitlines()
    chunks = []
    window = 60
    for i in range(0, len(lines), window):
        text = "\n".join(lines[i:i + window])
        chunks.append({
            "text": text,
            "start_line": i + 1,
            "end_line": min(i + window, len(lines)),
            "chunk_type": "lines",
        })
    return chunks


def chunk_markdown(text: str) -> list[dict]:
    """
    Split markdown into sections at heading boundaries (# ## ###).

    WHY headings: markdown documents are organized by headings. Each heading
    introduces a new topic — splitting there keeps related content together.
    """
    pattern = re.compile(r"(?=^#{1,3} )", re.MULTILINE)
    sections = pattern.split(text)
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        if len(section) > MAX_CHUNK_CHARS:
            section = section[:MAX_CHUNK_CHARS]
        chunks.append({"text": section, "chunk_type": "section"})
    return chunks


def chunk_html(html: str) -> list[dict]:
    """
    Split HTML docs into sections at h1/h2/h3 heading boundaries.
    Strips all HTML tags, keeps plain text per section.

    WHY BeautifulSoup: API docs are HTML pages. We extract visible text
    organized by headings, ignoring nav bars, footers, and scripts.
    """
    soup = BeautifulSoup(html, "html.parser")
    headings = soup.find_all(["h1", "h2", "h3"])
    chunks = []

    for heading in headings:
        section_text = heading.get_text(separator=" ", strip=True) + "\n"
        for sibling in heading.find_next_siblings():
            if sibling.name in ["h1", "h2", "h3"]:
                break
            section_text += sibling.get_text(separator=" ", strip=True) + "\n"

        section_text = section_text.strip()
        if not section_text:
            continue
        if len(section_text) > MAX_CHUNK_CHARS:
            section_text = section_text[:MAX_CHUNK_CHARS]

        chunks.append({"text": section_text, "chunk_type": "section"})

    return chunks
