import uuid
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
            json={"content": "How much is the home office ergonomic workspace stipend?", "conversation_id": "test-session"},
            headers=headers
        )
        assert chat_resp.status_code == 200
        chat_data = chat_resp.json()
        assert chat_data["category"] == "knowledge_query"
        assert chat_data["citations"] is not None
        assert len(chat_data["citations"]) > 0
        assert "1,200" in chat_data["content"] or "stipend" in chat_data["content"].lower() or len(chat_data["content"]) > 20

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
            json={"resolution_notes": "Employee contacted by HR partner via Teams.", "hr_assigned_to": "Maanvi"},
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

@pytest.mark.asyncio
async def test_multiprovider_auth_and_admin_deadline_assignment():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        test_uid = uuid.uuid4().hex[:6]
        david_email = f"david.{test_uid}@launchmate.com"
        # 1. Custom Employee Self-Signup
        signup_resp = await client.post("/api/v1/auth/signup", json={
            "email": david_email,
            "password": "SecurePassword123!",
            "full_name": "David Kim",
            "role": "Product Manager",
            "department": "Product",
            "location": "London, UK",
            "phone_number": f"+1425555{test_uid[:4]}"
        })
        assert signup_resp.status_code == 200
        signup_data = signup_resp.json()
        assert "access_token" in signup_data
        david_token = signup_data["access_token"]
        david_id = signup_data["user"]["id"]
        assert signup_data["user"]["role"] == "Product Manager"
        assert signup_data["user"]["location"] == "London, UK"

        # Check David's checklist tasks were automatically generated based on role/location
        david_headers = {"Authorization": f"Bearer {david_token}"}
        tasks_res = await client.get("/api/v1/tasks", headers=david_headers)
        assert tasks_res.status_code == 200
        david_tasks = tasks_res.json()
        assert len(david_tasks) > 0
        titles = [t["title"] for t in david_tasks]
        # Should have London UK task and Product Manager tasks
        assert any("London" in t or "Product" in t or "MFA" in t for t in titles)

        # 2. Google / Microsoft OAuth
        oauth_resp = await client.post("/api/v1/auth/oauth", json={
            "provider": "google",
            "email": f"emma.{test_uid}@gmail.com",
            "full_name": "Emma Watson",
            "role": "Software Engineer",
            "department": "Engineering",
            "location": "Redmond, WA"
        })
        assert oauth_resp.status_code == 200
        oauth_data = oauth_resp.json()
        assert "access_token" in oauth_data
        assert oauth_data["user"]["auth_provider"] == "google"

        # 3. Phone OTP Send & Verify
        test_phone = f"+142555{test_uid[:5]}"
        otp_send = await client.post("/api/v1/auth/phone/send-otp", json={"phone_number": test_phone})
        assert otp_send.status_code == 200
        assert otp_send.json()["status"] == "otp_sent"

        otp_verify = await client.post("/api/v1/auth/phone/verify-otp", json={
            "phone_number": test_phone,
            "otp_code": "123456",
            "full_name": "Mobile Tester",
            "role": "Software Engineer",
            "department": "Engineering",
            "location": "Redmond, WA"
        })
        assert otp_verify.status_code == 200
        assert "access_token" in otp_verify.json()

        # 4. Admin Assigns Custom Task with Deadline
        admin_login = await client.post("/api/v1/auth/login", json={
            "email": "admin@microsoft.com",
            "password": "Password123!"
        })
        admin_token = admin_login.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        assign_resp = await client.post("/api/v1/admin/assign-task", json={
            "user_id": david_id,
            "title": "Submit Compliance Audit Form",
            "description": "Mandatory compliance verification for Q4.",
            "category": "Legal",
            "priority": "high",
            "due_date": "2026-10-01T15:00:00Z"
        }, headers=admin_headers)
        assert assign_resp.status_code == 200
        assigned_tasks = assign_resp.json()
        assert len(assigned_tasks) == 1
        assert assigned_tasks[0]["title"] == "Submit Compliance Audit Form"
        custom_task_id = assigned_tasks[0]["id"]

        # 5. SendGrid Deadline Overdue Notification Dispatch
        notify_resp = await client.post(
            f"/api/v1/admin/notify-deadline-overdue?task_id={custom_task_id}",
            headers=admin_headers
        )
        assert notify_resp.status_code == 200
        notify_data = notify_resp.json()
        assert notify_data["status"] == "notified"
        assert notify_data["employee_email"] == david_email

@pytest.mark.asyncio
async def test_live_agent_call_support_flow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Login as Sarah Chen
        login_resp = await client.post("/api/v1/auth/login", json={
            "email": "sarah.chen@microsoft.com",
            "password": "Password123!"
        })
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Fetch live agent support lines
        lines_resp = await client.get("/api/v1/support/lines?topic=Need help with Azure IT setup", headers=headers)
        assert lines_resp.status_code == 200
        lines_data = lines_resp.json()
        assert "assigned_line" in lines_data
        assert "all_lines" in lines_data
        assert len(lines_data["all_lines"]) == 3
        # Should have routed to Marcus Vance (IT) or assigned line with phone number
        assigned = lines_data["assigned_line"]
        assert assigned["phone_number"] in ["+91 9772835979", "+91 8529782946"]

        # 2. Request Amazon-Style Callback
        call_resp = await client.post("/api/v1/support/request-call", json={
            "phone_number": "+91 9772835979",
            "topic": "Azure portal permissions unresolved",
            "call_type": "callback"
        }, headers=headers)
        assert call_resp.status_code == 200
        call_data = call_resp.json()
        assert call_data["status"] == "call_initiated"
        assert "assigned_agent" in call_data

        # 3. Fetch call logs
        logs_resp = await client.get("/api/v1/support/calls", headers=headers)
        assert logs_resp.status_code == 200
        logs = logs_resp.json()
        assert len(logs) > 0
        assert logs[0]["phone_number"] == "+91 9772835979"

        # 4. Guest / Unauthenticated caller can also get lines and request callback
        guest_lines = await client.get("/api/v1/support/lines?topic=HR Benefits")
        assert guest_lines.status_code == 200
        assert "assigned_line" in guest_lines.json()

        guest_call = await client.post("/api/v1/support/request-call", json={
            "phone_number": "+91 8529782946",
            "topic": "General question before login",
            "call_type": "callback"
        })
        assert guest_call.status_code == 200
        assert guest_call.json()["status"] == "call_initiated"

        # 5. Quick Switch endpoint generates valid token for any user ID
        users_resp = await client.get("/api/v1/auth/demo-users")
        assert users_resp.status_code == 200
        first_user = users_resp.json()[0]
        qs_resp = await client.post("/api/v1/auth/quick-switch", json={"user_id": first_user["id"]})
        assert qs_resp.status_code == 200
        assert "access_token" in qs_resp.json()
        assert qs_resp.json()["user"]["id"] == first_user["id"]

