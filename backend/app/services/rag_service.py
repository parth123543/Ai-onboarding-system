import math
import re
import json
import logging
from typing import List, Dict, Any, Optional, Tuple, AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from openai import AsyncOpenAI, AsyncAzureOpenAI
from app.core.config import settings
from app.models.document import Document, DocumentChunk
from app.schemas.chat import Citation

logger = logging.getLogger("rag_service")
logger.setLevel(logging.INFO)

class RAGService:
    def __init__(self):
        self._init_client()

    def _init_client(self):
        self.client = None
        self.is_azure = False
        
        if settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT:
            self.client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                api_version=settings.AZURE_OPENAI_API_VERSION,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
                timeout=15.0
            )
            self.chat_model = settings.AZURE_OPENAI_CHAT_DEPLOYMENT
            self.embed_model = settings.AZURE_OPENAI_EMBEDDING_DEPLOYMENT
            self.is_azure = True
        elif settings.OPENAI_API_KEY:
            self.client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=15.0
            )
            self.chat_model = settings.OPENAI_MODEL
            self.embed_model = settings.OPENAI_EMBEDDING_MODEL
            self.is_azure = False

    def _generate_local_embedding(self, text: str, dim: int = 128) -> List[float]:
        """
        Deterministic hash-based local vector representation.
        Guarantees that RAG retrieval works even without external API keys.
        """
        words = re.findall(r"\w+", text.lower())
        vec = [0.0] * dim
        if not words:
            return vec
        for word in words:
            # Multi-hash distribution
            h1 = hash(word) % dim
            h2 = (hash(word) * 31 + 17) % dim
            vec[h1] += 1.0
            vec[h2] += 0.5
        # Normalize vector
        norm = math.sqrt(sum(x * x for x in vec))
        if norm > 0:
            vec = [round(x / norm, 5) for x in vec]
        return vec

    async def get_embedding(self, text: str) -> List[float]:
        """Generates embedding using Azure/OpenAI or local fallback."""
        if self.client:
            try:
                response = await self.client.embeddings.create(
                    input=text[:8000],
                    model=self.embed_model
                )
                return response.data[0].embedding
            except Exception as e:
                logger.warning(f"Embedding API call failed: {e}. Falling back to local vectorizer.")
        return self._generate_local_embedding(text)

    def chunk_text(self, text: str, chunk_size: int = 350, overlap: int = 50) -> List[Dict[str, Any]]:
        """
        Splits markdown/document text into semantic ~300-500 word chunks
        preserving heading hierarchies and section context.
        """
        lines = text.split("\n")
        chunks = []
        current_section = "General Overview"
        current_words = []
        
        for line in lines:
            line_stripped = line.strip()
            # Detect section header
            if line_stripped.startswith("#"):
                header_title = line_stripped.lstrip("#").strip()
                if current_words:
                    content = " ".join(current_words)
                    chunks.append({
                        "section_title": current_section,
                        "content": content
                    })
                    # Keep overlap words
                    current_words = current_words[-overlap:] if len(current_words) > overlap else []
                current_section = header_title
                continue

            words = line_stripped.split()
            current_words.extend(words)
            
            if len(current_words) >= chunk_size:
                content = " ".join(current_words)
                chunks.append({
                    "section_title": current_section,
                    "content": content
                })
                current_words = current_words[-overlap:]

        if current_words:
            content = " ".join(current_words)
            if len(content.strip()) > 30:  # avoid empty remnants
                chunks.append({
                    "section_title": current_section,
                    "content": content
                })

        return chunks

    def cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        dot = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    async def ingest_document(
        self,
        db: AsyncSession,
        title: str,
        category: str,
        source_file: str,
        raw_text: str
    ) -> Document:
        """Chunks, embeds, and stores a document in the database."""
        # Create document record
        doc = Document(
            title=title,
            category=category,
            source_file=source_file
        )
        db.add(doc)
        await db.flush()

        chunks_data = self.chunk_text(raw_text)
        for idx, item in enumerate(chunks_data):
            embedding = await self.get_embedding(item["content"])
            chunk = DocumentChunk(
                document_id=doc.id,
                chunk_index=idx,
                section_title=item["section_title"],
                content=item["content"],
                embedding=embedding,
                metadata_json={"words": len(item["content"].split())}
            )
            db.add(chunk)

        await db.commit()
        await db.refresh(doc)
        logger.info(f"Ingested document '{title}' with {len(chunks_data)} chunks.")
        return doc

    async def retrieve_relevant_chunks(
        self,
        db: AsyncSession,
        query: str,
        top_k: int = 4
    ) -> List[Tuple[DocumentChunk, Document, float]]:
        """Retrieves top-k relevant chunks based on hybrid cosine and keyword similarity."""
        query_vec = await self.get_embedding(query)
        query_words = [w.lower() for w in re.findall(r"\w+", query) if len(w) > 2]
        
        # Query all chunks and join document
        stmt = select(DocumentChunk, Document).join(Document, DocumentChunk.document_id == Document.id)
        result = await db.execute(stmt)
        rows = result.all()

        scored = []
        for chunk, doc in rows:
            if not chunk.embedding:
                continue
            cos_score = self.cosine_similarity(query_vec, chunk.embedding)
            
            # Hybrid lexical overlap boost
            content_lower = chunk.content.lower()
            section_lower = (chunk.section_title or "").lower()
            title_lower = doc.title.lower()

            matched_terms = 0
            for term in query_words:
                if term in section_lower:
                    matched_terms += 2.0
                elif term in title_lower:
                    matched_terms += 1.5
                elif term in content_lower:
                    matched_terms += 1.0

            lexical_boost = min(0.40, (matched_terms / (len(query_words) * 2.0))) if query_words else 0.0
            final_score = cos_score * 0.65 + lexical_boost * 0.35 + (0.10 if matched_terms > 1 else 0.0)
            
            scored.append((chunk, doc, round(final_score, 4)))

        # Sort descending by score
        scored.sort(key=lambda x: x[2], reverse=True)
        return scored[:top_k]

    async def generate_grounded_answer(
        self,
        query: str,
        retrieved_chunks: List[Tuple[DocumentChunk, Document, float]]
    ) -> Tuple[str, List[Citation]]:
        """
        Generates answer strictly constrained to retrieved context with citations.
        Returns (answer_text, citations_list).
        """
        # Filter chunks that meet minimum relevance threshold
        valid_chunks = [c for c in retrieved_chunks if c[2] >= settings.SIMILARITY_THRESHOLD]

        citations: List[Citation] = []
        for chunk, doc, score in valid_chunks:
            citations.append(Citation(
                title=doc.title,
                section=chunk.section_title or "Overview",
                source_file=doc.source_file,
                snippet=chunk.content[:240] + ("..." if len(chunk.content) > 240 else ""),
                score=round(score, 3)
            ))

        # If no chunks passed threshold, fail gracefully and offer escalation
        if not valid_chunks:
            fallback_msg = (
                "I searched our official Contoso / Microsoft onboarding documentation, but I could not find a verified answer to your specific question.\n\n"
                "To ensure you receive accurate and up-to-date guidance, I can escalate this directly to the HR Operations and People Team on your behalf, or connect you with your manager. Would you like me to open an escalation ticket?"
            )
            return fallback_msg, []

        # Build grounded context
        context_blocks = []
        for idx, (chunk, doc, score) in enumerate(valid_chunks, 1):
            context_blocks.append(
                f"[Document {idx}: {doc.title} | Section: {chunk.section_title or 'General'}]\n{chunk.content}"
            )
        combined_context = "\n\n".join(context_blocks)

        system_prompt = (
            "You are the official Microsoft Innovate 2026 AI Onboarding Assistant.\n"
            "Your role is to guide new employees accurately using ONLY the provided verified company documentation.\n\n"
            "STRICT RULES:\n"
            "1. Answer using ONLY the facts present in the Context below. Do NOT assume, extrapolate, or invent details.\n"
            "2. If the Context does not answer the question or is ambiguous, explicitly state: 'This is not detailed in our current onboarding documentation' and advise contacting HR.\n"
            "3. Cite the exact document title and section for each policy point.\n"
            "4. Format your answer with clean Markdown headers, bullet points, and bold keywords for readability."
        )

        user_prompt = f"Context:\n{combined_context}\n\nUser Question:\n{query}"

        if self.client:
            try:
                response = await self.client.chat.completions.create(
                    model=self.chat_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.1,
                    max_tokens=650
                )
                answer = response.choices[0].message.content or ""
                return answer, citations
            except Exception as e:
                logger.error(f"Error calling LLM for RAG answer: {e}. Generating offline grounded summary.")

        # Offline grounded synthesis fallback
        top_chunk, top_doc, top_score = valid_chunks[0]
        answer = (
            f"Based on **{top_doc.title}** (*Section: {top_chunk.section_title}*):\n\n"
            f"{top_chunk.content}\n\n"
            f"> *Source Reference: {top_doc.title} ({top_doc.source_file}) — Relevance score: {top_score:.2f}*"
        )
        return answer, citations

    async def stream_grounded_answer(
        self,
        query: str,
        retrieved_chunks: List[Tuple[DocumentChunk, Document, float]]
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        Yields token-by-token streaming events for SSE/WebSocket clients.
        Yields dictionaries with type: 'token', 'citations', 'complete'.
        """
        valid_chunks = [c for c in retrieved_chunks if c[2] >= settings.SIMILARITY_THRESHOLD]
        citations = [
            {
                "title": doc.title,
                "section": chunk.section_title or "Overview",
                "source_file": doc.source_file,
                "snippet": chunk.content[:240] + ("..." if len(chunk.content) > 240 else ""),
                "score": round(score, 3)
            }
            for chunk, doc, score in valid_chunks
        ]

        # First yield citations
        yield {"type": "citations", "citations": citations}

        if not valid_chunks:
            fallback = (
                "I searched our official onboarding documentation, but I could not find a verified answer to your question.\n\n"
                "To ensure you receive accurate and up-to-date guidance, I can escalate this directly to the HR Operations and People Team on your behalf. "
                "Would you like me to open an escalation ticket?"
            )
            for word in fallback.split(" "):
                yield {"type": "token", "token": word + " "}
            yield {"type": "done"}
            return

        # Prepare context
        context_blocks = [
            f"[{doc.title} | {chunk.section_title}]\n{chunk.content}"
            for chunk, doc, score in valid_chunks
        ]
        combined_context = "\n\n".join(context_blocks)

        system_prompt = (
            "You are the official Microsoft Innovate 2026 AI Onboarding Assistant. "
            "Answer the user's question using ONLY the provided verified context. "
            "Be concise, clear, and cite the document names. If information is missing, admit it explicitly."
        )

        if self.client:
            try:
                stream = await self.client.chat.completions.create(
                    model=self.chat_model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": f"Context:\n{combined_context}\n\nQuestion:\n{query}"}
                    ],
                    stream=True,
                    temperature=0.1,
                    max_tokens=650
                )
                async for chunk in stream:
                    delta = chunk.choices[0].delta.content if chunk.choices else None
                    if delta:
                        yield {"type": "token", "token": delta}
                yield {"type": "done"}
                return
            except Exception as e:
                logger.warning(f"Streaming failed: {e}. Using token simulation.")

        # Offline streaming simulation
        top_chunk, top_doc, _ = valid_chunks[0]
        text_response = (
            f"According to **{top_doc.title}** (*{top_chunk.section_title}*):\n\n"
            f"{top_chunk.content}\n\n"
            f"**Citations:**\n- [{top_doc.title} - {top_chunk.section_title}]"
        )
        words = text_response.split(" ")
        for word in words:
            yield {"type": "token", "token": word + " "}
        yield {"type": "done"}

rag_service = RAGService()
