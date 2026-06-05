from app.ingestion.chunker import chunk_code, chunk_markdown, chunk_html


def test_chunk_python_splits_by_function():
    source = """
def add(a, b):
    return a + b

def multiply(a, b):
    return a * b
"""
    chunks = chunk_code(source, language="python")
    assert len(chunks) == 2
    assert "def add" in chunks[0]["text"]
    assert "def multiply" in chunks[1]["text"]
    assert chunks[0]["chunk_type"] == "function"


def test_chunk_python_class():
    source = """
class Calculator:
    def add(self, a, b):
        return a + b
"""
    chunks = chunk_code(source, language="python")
    assert len(chunks) == 1
    assert chunks[0]["chunk_type"] == "class"


def test_chunk_markdown_splits_by_heading():
    md = """# Title

Intro text.

## Section One

Content one.

## Section Two

Content two.
"""
    chunks = chunk_markdown(md)
    assert len(chunks) == 3
    assert "Intro text" in chunks[0]["text"]
    assert "Section One" in chunks[1]["text"]
    assert "Section Two" in chunks[2]["text"]


def test_chunk_unsupported_language_falls_back_to_lines():
    source = "\n".join([f"line {i}" for i in range(200)])
    chunks = chunk_code(source, language="ruby")
    assert len(chunks) > 1
    for chunk in chunks:
        assert len(chunk["text"]) <= 3000


def test_chunk_html_splits_by_heading():
    html = """
<h1>API Reference</h1>
<p>Overview text.</p>
<h2>Endpoints</h2>
<p>List of endpoints.</p>
<h2>Authentication</h2>
<p>Auth details.</p>
"""
    chunks = chunk_html(html)
    assert len(chunks) == 3
    assert "Overview" in chunks[0]["text"]
    assert "Endpoints" in chunks[1]["text"]
    assert "Authentication" in chunks[2]["text"]
