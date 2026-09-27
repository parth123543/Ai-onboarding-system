import pytest
from app.services.agent_router import agent_router_service

@pytest.mark.asyncio
async def test_router_sensitive_topics_escalation():
    # Harassment query
    decision = await agent_router_service.route("Someone made inappropriate comments to me in the elevator, what should I do?")
    assert decision.category == "escalate"
    assert decision.is_sensitive is True
    assert "Harassment" in decision.sensitivity_reason

    # Visa / immigration query
    decision = await agent_router_service.route("Can the company sponsor my H-1B or Green Card transfer?")
    assert decision.category == "escalate"
    assert decision.is_sensitive is True
    assert "Immigration" in decision.sensitivity_reason

    # Salary / compensation dispute
    decision = await agent_router_service.route("I think my salary and bonus are lower than agreed, who handles pay disputes?")
    assert decision.category == "escalate"
    assert decision.is_sensitive is True
    assert "Compensation" in decision.sensitivity_reason

@pytest.mark.asyncio
async def test_router_task_action_detection():
    # Mark task complete
    decision = await agent_router_service.route("Please mark my MFA setup task as completed")
    assert decision.category == "task_action"
    assert decision.detected_action == "complete_task"
    assert decision.confidence >= 0.70

    # Raise IT ticket
    decision = await agent_router_service.route("Raise an IT ticket for a replacement monitor cable")
    assert decision.category == "task_action"
    assert decision.detected_action == "raise_it_ticket"

    # Book orientation
    decision = await agent_router_service.route("Book my slot for the new joiner orientation session")
    assert decision.category == "task_action"
    assert decision.detected_action == "book_orientation"

@pytest.mark.asyncio
async def test_router_knowledge_queries():
    # Benefits question
    decision = await agent_router_service.route("What is our 401(k) matching policy and vesting schedule?")
    assert decision.category == "knowledge_query"
    assert decision.confidence >= 0.70

    # Remote work stipend
    decision = await agent_router_service.route("How much is the home office ergonomic allowance?")
    assert decision.category == "knowledge_query"
    assert decision.confidence >= 0.70

@pytest.mark.asyncio
async def test_router_ambiguous_defaults_to_escalation():
    # Ambiguous gibberish
    decision = await agent_router_service.route("asdfqwerty random unparseable sentence")
    assert decision.category == "escalate"
