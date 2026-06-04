from __future__ import annotations

import asyncio
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

try:
    import resend
except ImportError:  # pragma: no cover
    resend = None  # type: ignore[assignment]

try:
    from twilio.rest import Client as TwilioClient
except ImportError:  # pragma: no cover
    TwilioClient = None  # type: ignore[assignment]


def _smtp_ready() -> bool:
    return bool(settings.SYSTEM_GMAIL_USER and settings.SYSTEM_GMAIL_APP_PASS)


async def _send_via_smtp(to_email: str, subject: str, html_body: str) -> bool:
    """Send email via Gmail SMTP using an App Password.

    Used as fallback when RESEND_API_KEY is not configured.
    Requires SYSTEM_GMAIL_USER and SYSTEM_GMAIL_APP_PASS in settings.
    """
    if not _smtp_ready():
        return False

    def _send() -> None:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = settings.SYSTEM_GMAIL_USER
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(settings.SYSTEM_GMAIL_USER, settings.SYSTEM_GMAIL_APP_PASS)
            server.sendmail(settings.SYSTEM_GMAIL_USER, to_email, msg.as_string())

    await asyncio.to_thread(_send)
    return True


def _email_html(otp: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e8eaf2">
        <div style="font-size:22px;font-weight:700;color:#111827">OneClerk.ai</div>
        <h1 style="font-size:24px;color:#111827;margin:24px 0 8px">Verify your email</h1>
        <p style="color:#4b5563;line-height:1.6">Use this one-time code to finish creating your OneClerk account.</p>
        <div style="font-size:36px;letter-spacing:8px;font-weight:800;color:#111827;background:#f3f4f6;border-radius:12px;padding:18px;text-align:center;margin:24px 0">
          {otp}
        </div>
        <p style="color:#6b7280;font-size:14px">This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    </div>
    """


def _email_link_html(verification_link: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e8eaf2">
        <div style="font-size:22px;font-weight:700;color:#111827">OneClerk.ai</div>
        <h1 style="font-size:24px;color:#111827;margin:24px 0 8px">Verify your email</h1>
        <p style="color:#4b5563;line-height:1.6">Click the button below to verify your email address and complete your OneClerk account setup.</p>
        <div style="text-align:center;margin:32px 0">
          <a href="{verification_link}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:600;font-size:16px">
            Verify Email
          </a>
        </div>
        <p style="color:#6b7280;font-size:14px">This link expires in 24 hours. If you did not request this, you can ignore this email.</p>
        <p style="color:#6b7280;font-size:14px">Or copy and paste this link into your browser:</p>
        <p style="color:#4b5563;font-size:12px;word-break:break-all">{verification_link}</p>
      </div>
    </div>
    """


async def send_email_otp(email: str, otp: str) -> bool:
    subject = "Your Harkly AI verification code"
    html = _email_html(otp)
    if settings.RESEND_API_KEY:
        if resend is None:
            raise RuntimeError("resend package is not installed")

        def _send() -> None:
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send(
                {
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": email,
                    "subject": subject,
                    "html": html,
                }
            )

        await asyncio.to_thread(_send)
        return True

    return await _send_via_smtp(email, subject, html)


async def send_sms_otp(phone_number: str, otp: str) -> bool:
    if not (
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_PHONE_NUMBER
    ):
        return False
    if TwilioClient is None:
        raise RuntimeError("twilio package is not installed")

    def _send() -> None:
        client = TwilioClient(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
        client.messages.create(
            body=f"Your OneClerk verification code is {otp}. It expires in 5 minutes.",
            from_=settings.TWILIO_PHONE_NUMBER,
            to=phone_number,
        )

    await asyncio.to_thread(_send)
    return True


async def send_email_verification_link(email: str, verification_link: str) -> bool:
    """Send a verification link instead of OTP for email verification."""
    subject = "Verify your Harkly AI email"
    html = _email_link_html(verification_link)
    if settings.RESEND_API_KEY:
        if resend is None:
            raise RuntimeError("resend package is not installed")

        def _send() -> None:
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send(
                {
                    "from": settings.RESEND_FROM_EMAIL,
                    "to": email,
                    "subject": subject,
                    "html": html,
                }
            )

        await asyncio.to_thread(_send)
        return True

    return await _send_via_smtp(email, subject, html)


async def send_call_transcript_email(
    owner_email: str,
    agent_name: str,
    caller_number: str,
    summary: str,
    duration_seconds: int = 0,
    appointment_booked: bool = False,
) -> bool:
    """Send a concise call transcript summary to the agent owner after every call."""
    duration_fmt = f"{duration_seconds // 60}m {duration_seconds % 60}s" if duration_seconds else "—"
    booked_line = "<span style='color:#16a34a;font-weight:600'>✓ Appointment booked</span>" if appointment_booked else "No appointment"
    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px 32px;border:1px solid #e8eaf2">
        <div style="font-size:13px;font-weight:700;color:#f59e0b;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">Harkly AI — Call Summary</div>
        <h2 style="font-size:20px;color:#111827;margin:0 0 18px">{agent_name}</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
          <tr><td style="padding:6px 0;color:#6b7280;width:38%">Caller</td><td style="padding:6px 0;font-weight:600">{caller_number}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Duration</td><td style="padding:6px 0">{duration_fmt}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Outcome</td><td style="padding:6px 0">{booked_line}</td></tr>
        </table>
        <div style="margin-top:18px;background:#f9fafb;border-radius:10px;padding:16px">
          <div style="font-size:12px;font-weight:600;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Summary</div>
          <div style="font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap">{summary[:900]}</div>
        </div>
        <div style="margin-top:18px;text-align:center">
          <a href="https://harkly.ai/app" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600">Open Dashboard →</a>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-top:20px;text-align:center">Harkly AI · Call handled automatically</p>
      </div>
    </div>
    """
    subject = f"📞 Call summary — {agent_name} ({caller_number})"
    if settings.RESEND_API_KEY and resend is not None:
        def _send() -> None:
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({"from": settings.RESEND_FROM_EMAIL, "to": owner_email, "subject": subject, "html": html})
        await asyncio.to_thread(_send)
        return True
    return await _send_via_smtp(owner_email, subject, html)


async def send_no_show_email(
    owner_email: str,
    agent_name: str,
    caller_number: str,
    appointment_details: str = "",
) -> bool:
    """Notify owner when a confirmed caller did not show up."""
    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;padding:28px 32px;border:1px solid #fca5a5">
        <div style="font-size:13px;font-weight:700;color:#dc2626;letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">No-Show Alert</div>
        <h2 style="font-size:20px;color:#111827;margin:0 0 14px">Confirmed caller did not appear</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;color:#374151">
          <tr><td style="padding:6px 0;color:#6b7280;width:38%">Agent</td><td style="padding:6px 0;font-weight:600">{agent_name}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Caller</td><td style="padding:6px 0">{caller_number}</td></tr>
          {f'<tr><td style="padding:6px 0;color:#6b7280">Appointment</td><td style="padding:6px 0">{appointment_details}</td></tr>' if appointment_details else ""}
        </table>
        <div style="margin-top:16px;padding:14px;background:#fef2f2;border-radius:8px;font-size:14px;color:#991b1b">
          A follow-up WhatsApp message has been sent to the caller automatically.
        </div>
        <div style="margin-top:18px;text-align:center">
          <a href="https://harkly.ai/app" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:13px;font-weight:600">View in Dashboard →</a>
        </div>
      </div>
    </div>
    """
    subject = f"⚠️ No-show — {caller_number} ({agent_name})"
    if settings.RESEND_API_KEY and resend is not None:
        def _send() -> None:
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({"from": settings.RESEND_FROM_EMAIL, "to": owner_email, "subject": subject, "html": html})
        await asyncio.to_thread(_send)
        return True
    return await _send_via_smtp(owner_email, subject, html)


async def send_signup_confirmation(email: str, name: str = "") -> bool:
    """Send a welcome / account-confirmed email after successful signup.

    Tries Resend first, falls back to Gmail SMTP.
    """
    greeting = f"Hi {name}," if name else "Hi there,"
    html = f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e8eaf2">
        <div style="font-size:22px;font-weight:700;color:#111827">Harkly AI</div>
        <h1 style="font-size:24px;color:#111827;margin:24px 0 8px">Welcome aboard 🎉</h1>
        <p style="color:#4b5563;line-height:1.6">{greeting}<br><br>
          Your account is all set. Head to the dashboard to create your first AI receptionist — it takes less than 5 minutes.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="https://harkly.ai/app" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:16px 32px;border-radius:8px;font-weight:600;font-size:16px">
            Open Dashboard
          </a>
        </div>
        <p style="color:#6b7280;font-size:13px">Questions? Reply to this email — we read every one.</p>
      </div>
    </div>
    """
    subject = "Welcome to Harkly AI — your account is ready"
    if settings.RESEND_API_KEY and resend is not None:
        def _send() -> None:
            resend.api_key = settings.RESEND_API_KEY
            resend.Emails.send({"from": settings.RESEND_FROM_EMAIL, "to": email, "subject": subject, "html": html})
        await asyncio.to_thread(_send)
        return True

    return await _send_via_smtp(email, subject, html)
