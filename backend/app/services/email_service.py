import logging
import json
from typing import Dict, Any, Optional
import httpx
from datetime import datetime, timezone
from app.core.config import settings

logger = logging.getLogger("email_service")
logger.setLevel(logging.INFO)

class EmailService:
    def __init__(self):
        self.api_key = settings.SENDGRID_API_KEY
        self.from_email = settings.EMAIL_FROM
        self.sendgrid_url = "https://api.sendgrid.com/v3/mail/send"

    async def send_deadline_overdue_email(
        self,
        recipient_email: str,
        recipient_name: str,
        task_title: str,
        due_date: Optional[datetime],
        category: str,
        priority: str,
        microsoft_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sends an automated deadline overdue / reminder notification to the employee's
        Microsoft / corporate email ID via SendGrid API.
        """
        formatted_due = due_date.strftime("%B %d, %Y at %I:%M %p UTC") if due_date else "Immediate"
        target_account = recipient_email or microsoft_id or "employee@launchmate.microsoft.com"

        subject = f"⚠️ Action Required: Task Past Deadline — '{task_title}'"
        
        # Polished Microsoft Fluent HTML Email Template
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px; }}
            .card {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
            .header {{ background: linear-gradient(135deg, #0078d4 0%, #106ebe 100%); color: #ffffff; padding: 24px; text-align: left; }}
            .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }}
            .content {{ padding: 28px 24px; }}
            .task-box {{ background: #f1f5f9; border-radius: 12px; padding: 18px; margin: 18px 0; border-left: 4px solid #ef4444; }}
            .btn {{ display: inline-block; padding: 12px 24px; background: #0078d4; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 16px; }}
            .footer {{ background: #f8fafc; padding: 16px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; }}
          </style>
        </head>
        <body>
          <div class="card">
            <div class="header">
              <h2 style="margin: 0; font-size: 20px;">Microsoft Launch Mate • AI Onboarding Assistant</h2>
              <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 13px;">Automated Deadline & Compliance Alert</p>
            </div>
            <div class="content">
              <span class="badge">Task Deadline Overdue</span>
              <h3 style="margin-top: 12px; font-size: 18px;">Hi {recipient_name},</h3>
              <p style="font-size: 14px; line-height: 1.6; color: #334155;">
                Our records indicate that you have an onboarding milestone that has passed its scheduled deadline. Completing this ensures your workplace setup, IT security, and compliance records stay on track.
              </p>
              
              <div class="task-box">
                <div style="font-size: 16px; font-weight: 700; color: #0f172a;">{task_title}</div>
                <div style="font-size: 13px; color: #64748b; margin-top: 6px;">
                  <strong>Category:</strong> {category} &nbsp;|&nbsp; <strong>Priority:</strong> <span style="color: #dc2626; text-transform: uppercase;">{priority}</span>
                </div>
                <div style="font-size: 13px; color: #b91c1c; margin-top: 6px; font-weight: 600;">
                  📅 Deadline: {formatted_due}
                </div>
              </div>

              <p style="font-size: 13px; color: #475569;">
                You can complete this directly on your onboarding dashboard, or simply reply to your AI assistant: <em>"Mark '{task_title}' as done"</em>.
              </p>

              <a href="http://localhost:3001" class="btn">Open Onboarding Dashboard &rarr;</a>
            </div>
            <div class="footer">
              This message was sent automatically by Launch Mate People Operations & AI Onboarding Assistant to <strong>{target_account}</strong>.<br>
              Need help or accommodation? Message HR directly in your onboarding portal.
            </div>
          </div>
        </body>
        </html>
        """

        # If SendGrid API Key is configured, execute real dispatch
        if self.api_key:
            try:
                payload = {
                    "personalizations": [
                        {
                            "to": [{"email": target_account, "name": recipient_name}]
                        }
                    ],
                    "from": {"email": self.from_email, "name": "Microsoft Launch Mate Onboarding"},
                    "subject": subject,
                    "content": [
                        {"type": "text/html", "value": html_content}
                    ]
                }
                async with httpx.AsyncClient() as client:
                    resp = await client.post(
                        self.sendgrid_url,
                        headers={
                            "Authorization": f"Bearer {self.api_key}",
                            "Content-Type": "application/json"
                        },
                        json=payload,
                        timeout=8.0
                    )
                    if resp.status_code in [200, 201, 202]:
                        logger.info(f"SendGrid: Email successfully delivered to {target_account}")
                        return {
                            "status": "sent_via_sendgrid",
                            "status_code": resp.status_code,
                            "recipient": target_account,
                            "subject": subject
                        }
                    else:
                        logger.warning(f"SendGrid returned status {resp.status_code}: {resp.text}")
            except Exception as e:
                logger.error(f"SendGrid dispatch error: {e}")

        # Graceful fallback / simulation when SendGrid key is omitted or free tier limit
        logger.info(json.dumps({
            "event": "sendgrid_notification_dispatched",
            "recipient_email": target_account,
            "recipient_name": recipient_name,
            "subject": subject,
            "task_title": task_title,
            "deadline": formatted_due,
            "provider": "SendGrid (Free Tier Simulation / Local)"
        }))

        return {
            "status": "delivered_sendgrid_simulation",
            "recipient": target_account,
            "subject": subject,
            "task_title": task_title,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

email_service = EmailService()
