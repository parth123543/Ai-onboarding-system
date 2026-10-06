import pytest
from app.db.session import AsyncSessionLocal
from app.services.rag_service import rag_service

@pytest.mark.asyncio
async def test_chunking_logic():
    sample_markdown = (
        "# Main Policy\n\n"
        "Here is the introduction to company benefits.\n\n"
        "## Health Plan Details\n\n"
        + "Employees receive dental, vision, and prescription coverage. " * 30 + "\n\n"
        "## Retirement Match\n\n"
        + "Launch Mate matches 50% of your contributions up to 6%. " * 20
    )
    chunks = rag_service.chunk_text(sample_markdown, chunk_size=40, overlap=5)
    assert len(chunks) >= 2
    assert any("Health" in c["section_title"] for c in chunks)
    assert any("Retirement" in c["section_title"] for c in chunks)

@pytest.mark.asyncio
async def test_rag_retrieval_and_citations():
    async with AsyncSessionLocal() as db:
        # Query 401(k) matching
        query = "What is the 401k employer match percentage and vesting?"
        chunks = await rag_service.retrieve_relevant_chunks(db, query, top_k=3)
        assert len(chunks) > 0

        answer, citations = await rag_service.generate_grounded_answer(query, chunks)
        assert len(citations) > 0
        assert any("Benefits" in c.title or "Handbook" in c.title for c in citations)
        assert "50%" in answer or "match" in answer.lower()

@pytest.mark.asyncio
async def test_rag_out_of_domain_graceful_fallback():
    async with AsyncSessionLocal() as db:
        # Question not in docs (e.g. quantum teleportation)
        unrelated_query = "What is the company policy on private astronaut submarine travel to Mars?"
        chunks = await rag_service.retrieve_relevant_chunks(db, unrelated_query, top_k=2)
        # Force low score chunks
        answer, citations = await rag_service.generate_grounded_answer(unrelated_query, [])
        assert "not find a verified answer" in answer or "escalate" in answer.lower()
