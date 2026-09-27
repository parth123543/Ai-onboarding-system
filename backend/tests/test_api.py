import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_health_and_root():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_auth_login_and_me():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Successful login
        resp = await client.post("/api/v1/auth/login", json={
            "email": "sarah.chen@microsoft.com",
            "password": "Password123!"
        })
        assert resp.status_code == 200
        token_data = resp.json()
        assert "access_token" == token_data["token_type"] or "access_token" in token_data
        token = token_data["access_token"]

        # Fetch me
        headers = {"Authorization": f"Bearer {token}"}
        me_resp = await client.get("/api/v1/auth/me", headers=headers)
        assert me_resp.status_code == 200
        me = me_resp.json()
        assert me["email"] == "sarah.chen@microsoft.com"
        assert me["role"] == "Software Engineer"
        assert me["location"] == "Redmond, WA"

        # Wrong password
        bad_resp = await client.post("/api/v1/auth/login", json={
            "email": "sarah.chen@microsoft.com",
            "password": "WrongPassword!"
        })
        assert bad_resp.status_code == 401

@pytest.mark.asyncio
async def test_tasks_api_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/v1/auth/login", json={
            "email": "sarah.chen@microsoft.com",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # Get tasks
        tasks_resp = await client.get("/api/v1/tasks", headers=headers)
        assert tasks_resp.status_code == 200
        tasks = tasks_resp.json()
        assert len(tasks) > 0
        task_id = tasks[0]["id"]

        # Update status
        patch_resp = await client.patch(
            f"/api/v1/tasks/{task_id}/status",
            json={"status": "completed"},
            headers=headers
        )
        assert patch_resp.status_code == 200
        assert patch_resp.json()["status"] == "completed"

        # Get stats
        stats_resp = await client.get("/api/v1/tasks/stats", headers=headers)
        assert stats_resp.status_code == 200
        assert stats_resp.json()["completed_tasks"] >= 1

@pytest.mark.asyncio
async def test_chat_turn_rag_and_escalation():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_res = await client.post("/api/v1/auth/login", json={
            "email": "sarah.chen@microsoft.com",
            "password": "Password123!"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Knowledge query -> RAG answer with citation
        chat_resp = await client.post(
            "/api/v1/chat",
            json={"content": "What is the home office equipment allowance amount?", "conversation_id": "test-session"},
            headers=headers
        )
        assert chat_resp.status_code == 200
        chat_data = chat_resp.json()
        assert chat_data["category"] == "knowledge_query"
        assert chat_data["citations"] is not None
        assert len(chat_data["citations"]) > 0
        assert "1,200" in chat_data["content"] or "stipend" in chat_data["content"].lower() or "allowance" in chat_data["content"].lower()

        # 2. Sensitive query -> Immediate Escalation
        esc_resp = await client.post(
            "/api/v1/chat",
            json={"content": "I am experiencing severe harassment from a coworker.", "conversation_id": "test-session"},
            headers=headers
        )
        assert esc_resp.status_code == 200
        esc_data = esc_resp.json()
        assert esc_data["category"] == "escalate"
        assert "ESC-" in esc_data["content"]

@pytest.mark.asyncio
async def test_teams_bot_webhook():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "type": "message",
            "id": "teams-msg-123",
            "channelId": "msteams",
            "from": {"id": "user-teams", "name": "Sarah Chen", "email": "sarah.chen@microsoft.com"},
            "conversation": {"id": "conv-teams-1"},
            "recipient": {"id": "bot-id", "name": "AI Onboarding Assistant"},
            "text": "What are our core working hours?"
        }
        resp = await client.post("/api/v1/chat/teams", json=payload)
        assert resp.status_code == 200
        reply = resp.json()
        assert reply["type"] == "message"
        assert "text" in reply
        assert len(reply["text"]) > 10

@pytest.mark.asyncio
async def test_admin_escalation_and_nudge():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_login = await client.post("/api/v1/auth/login", json={
            "email": "admin@microsoft.com",
            "password": "Password123!"
        })
        admin_token = admin_login.json()["access_token"]
        headers = {"Authorization": f"Bearer {admin_token}"}

        # Check escalations
        esc_resp = await client.get("/api/v1/admin/escalations", headers=headers)
        assert esc_resp.status_code == 200
        escalations = esc_resp.json()
        assert len(escalations) > 0

        # Resolve escalation
        esc_id = escalations[0]["id"]
        resolve_resp = await client.post(
            f"/api/v1/admin/escalations/{esc_id}/resolve",
            json={"resolution_notes": "Employee contacted by HR partner via Teams.", "hr_assigned_to": "Elena Rostova"},
            headers=headers
        )
        assert resolve_resp.status_code == 200

        # Trigger fast-forward demo nudge
        nudge_resp = await client.post("/api/v1/admin/nudges/trigger?simulate=true", headers=headers)
        assert nudge_resp.status_code == 200

        # Check admin stats
        stats_resp = await client.get("/api/v1/admin/stats", headers=headers)
        assert stats_resp.status_code == 200
        stats = stats_resp.json()
        assert stats["total_new_joiners"] >= 3
