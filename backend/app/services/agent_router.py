import json
import logging
import re
import time
from typing import Optional, Dict, Any, Tuple
from openai import AsyncOpenAI, AsyncAzureOpenAI
from app.core.config import settings
from app.schemas.chat import AgentRouterDecision

# Set up structured JSON logger
logger = logging.getLogger("agent_router")
logger.setLevel(logging.INFO)

# Sensitive topic regexes for instant deterministic guardrails
SENSITIVE_PATTERNS = [
    (r"\b(harass(ment)?|bully(ing)?|abuse|assault|discrimina(tion|te)|hostile work|inappropriate|misconduct|unwelcome)\b", "Workplace Conduct & Harassment"),
    (r"\b(visa|h1-?b|green card|sponsorship|opt|cpt|work permit|immigration)\b", "Immigration & Legal Visa Status"),
    (r"\b(salary|compensation|pay raise|salary raise|bonus|equity|stock options|underpaid|dispute pay|payroll issue)\b", "Confidential Compensation & Payroll"),
    (r"\b(sue|lawsuit|lawyer|attorney|legal action|subpoena|whistleblower)\b", "Legal & Compliance Issue"),
    (r"\b(fir(ed|ing)|terminat(ed|ion)|severance|layoff|laid off|pip|performance improvement)\b", "Employment Status & Severance"),
    (r"\b(depress(ed|ion)|suicid(e|al)|mental breakdown|severe distress)\b", "Employee Wellbeing & Crisis Support"),
]

TASK_ACTION_PATTERNS = [
    (r"\b(mark|set|check|complete|done|finish)\b.*\b(task|checklist|mfa|laptop|intune|orientation)\b", "complete_task"),
    (r"\b(show|view|list|what are|display)\b.*\b(tasks|checklist|todo|to-do)\b", "list_tasks"),
    (r"\b(raise|open|create|submit)\b.*\b(ticket|it help|it request|hardware issue)\b", "raise_it_ticket"),
    (r"\b(book|schedule|reserve|slot)\b.*\b(orientation|session|meeting|call)\b", "book_orientation"),
    (r"\b(how am i doing|progress|completion percentage|status of my onboarding)\b", "check_progress"),
]

class AgentRouterService:
    def __init__(self):
        self._init_llm_client()

    def _init_llm_client(self):
        self.client = None
        self.is_azure = False
        
        if settings.AZURE_OPENAI_API_KEY and settings.AZURE_OPENAI_ENDPOINT:
            self.client = AsyncAzureOpenAI(
                api_key=settings.AZURE_OPENAI_API_KEY,
                api_version=settings.AZURE_OPENAI_API_VERSION,
                azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
                timeout=10.0
            )
            self.model_name = settings.AZURE_OPENAI_CHAT_DEPLOYMENT
            self.is_azure = True
        elif settings.OPENAI_API_KEY:
            self.client = AsyncOpenAI(
                api_key=settings.OPENAI_API_KEY,
                timeout=10.0
            )
            self.model_name = settings.OPENAI_MODEL
            self.is_azure = False

    def check_sensitivity(self, text: str) -> Tuple[bool, Optional[str]]:
        """Immediate deterministic guardrail check for sensitive topics."""
        lower = text.lower()
        for pattern, reason in SENSITIVE_PATTERNS:
            if re.search(pattern, lower):
                return True, reason
        return False, None

    def rule_based_fallback_classifier(self, text: str) -> AgentRouterDecision:
        """Deterministic classifier fallback when LLM is offline or times out."""
        is_sensitive, reason = self.check_sensitivity(text)
        if is_sensitive:
            return AgentRouterDecision(
                category="escalate",
                confidence=1.0,
                reasoning=f"High-priority sensitive topic detected ({reason}). Routing directly to human HR/Legal team.",
                is_sensitive=True,
                sensitivity_reason=reason
            )

        lower = text.lower()
        # Check task action patterns
        for pattern, action_name in TASK_ACTION_PATTERNS:
            match = re.search(pattern, lower)
            if match:
                params = {}
                if action_name == "complete_task":
                    # extract potential task keyword
                    params["task_query"] = text
                elif action_name == "raise_it_ticket":
                    params["subject"] = text
                    params["urgency"] = "medium"
                elif action_name == "book_orientation":
                    params["session_type"] = "New Joiner Welcome Cohort"
                return AgentRouterDecision(
                    category="task_action",
                    confidence=0.92,
                    reasoning=f"Identified clear user intent to execute workflow action '{action_name}'.",
                    detected_action=action_name,
                    action_parameters=params
                )

        # Knowledge indicators
        knowledge_keywords = ["what", "how", "where", "when", "why", "who", "can i", "policy", "benefit", "handbook", "pto", "vpn", "laptop", "insurance", "401k", "perk", "expense"]
        if any(k in lower for k in knowledge_keywords) or "?" in text:
            return AgentRouterDecision(
                category="knowledge_query",
                confidence=0.88,
                reasoning="Identified employee knowledge query regarding company policy, IT, or handbook."
            )

        # Explicit human / phone call request
        if any(word in lower for word in ["human", "agent", "person", "representative", "manager", "help me please", "escalate", "call", "phone", "dial", "speak to someone", "talk to someone"]):
            return AgentRouterDecision(
                category="escalate",
                confidence=0.95,
                reasoning="User explicitly requested human assistance or voice phone call."
            )

        # Ambiguous / Low confidence -> default to escalate
        return AgentRouterDecision(
            category="escalate",
            confidence=0.55,
            reasoning="Query intent is ambiguous or unclassified. System conservatively escalates to human HR."
        )

    async def route(self, message: str, user_id: Optional[str] = None) -> AgentRouterDecision:
        """
        Classifies incoming chat message into:
          - 'knowledge_query'
          - 'task_action'
          - 'escalate'
        Returns structured AgentRouterDecision and emits structured JSON log.
        """
        start_time = time.time()
        
        # Step 1: Deterministic fast sensitivity check
        is_sensitive, sensitive_reason = self.check_sensitivity(message)
        if is_sensitive:
            decision = AgentRouterDecision(
                category="escalate",
                confidence=1.0,
                reasoning=f"Critical sensitive topic detected: {sensitive_reason}. Escalated directly to HR.",
                is_sensitive=True,
                sensitivity_reason=sensitive_reason
            )
            self._log_decision(user_id, message, decision, time.time() - start_time)
            return decision

        # Step 2: LLM Classification if client is available
        if self.client:
            try:
                system_prompt = (
                    "You are the Core Agent Router for an enterprise employee onboarding assistant.\n"
                    "Your job is to strictly classify the user's message into one of three categories:\n"
                    "1. 'knowledge_query': The user is asking a question about company policies, benefits, IT setup, handbooks, guidelines, or contacts.\n"
                    "2. 'task_action': The user is instructing the assistant to perform an action (e.g., mark a task as done, show checklist, raise an IT ticket, book orientation slot).\n"
                    "3. 'escalate': The query involves sensitive matters (harassment, compensation dispute, visa/immigration, legal claims, grievances), "
                    "or explicit requests for a human, or is ambiguous with low confidence.\n\n"
                    "You must output ONLY valid JSON matching this schema:\n"
                    "{\n"
                    '  "category": "knowledge_query" | "task_action" | "escalate",\n'
                    '  "confidence": 0.0 to 1.0,\n'
                    '  "reasoning": "brief explanation",\n'
                    '  "detected_action": "complete_task" | "list_tasks" | "raise_it_ticket" | "book_orientation" | "check_progress" | null,\n'
                    '  "action_parameters": { "key": "value" } or null\n'
                    "}\n"
                    "CRITICAL: If confidence is below 0.70, or the intent is uncertain, set category to 'escalate'."
                )

                response = await self.client.chat.completions.create(
                    model=self.model_name,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": message}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.0,
                    max_tokens=250
                )
                
                raw_json = response.choices[0].message.content or "{}"
                data = json.loads(raw_json)
                
                confidence = float(data.get("confidence", 0.5))
                category = data.get("category", "escalate")
                
                # Guardrail: low confidence forces escalation
                if confidence < settings.CONFIDENCE_THRESHOLD:
                    category = "escalate"
                    reasoning = f"Low model confidence ({confidence:.2f} < {settings.CONFIDENCE_THRESHOLD}). Defaulting to human escalation."
                else:
                    reasoning = data.get("reasoning", "Classified by AI agent router.")

                decision = AgentRouterDecision(
                    category=category,
                    confidence=confidence,
                    reasoning=reasoning,
                    detected_action=data.get("detected_action"),
                    action_parameters=data.get("action_parameters"),
                    is_sensitive=False
                )
                self._log_decision(user_id, message, decision, time.time() - start_time)
                return decision

            except Exception as e:
                logger.warning(f"LLM router call failed or timed out: {e}. Falling back to deterministic classifier.")

        # Step 3: Fallback rule-based classifier
        decision = self.rule_based_fallback_classifier(message)
        self._log_decision(user_id, message, decision, time.time() - start_time)
        return decision

    def _log_decision(self, user_id: Optional[str], message: str, decision: AgentRouterDecision, elapsed_sec: float):
        """Emits structured JSON log for telemetry and auditability."""
        log_entry = {
            "timestamp": time.time(),
            "event": "agent_router_decision",
            "user_id": user_id or "anonymous",
            "message_snippet": message[:100],
            "category": decision.category,
            "confidence": round(decision.confidence, 4),
            "reasoning": decision.reasoning,
            "detected_action": decision.detected_action,
            "is_sensitive": decision.is_sensitive,
            "latency_ms": round(elapsed_sec * 1000, 2)
        }
        logger.info(json.dumps(log_entry))

agent_router_service = AgentRouterService()
