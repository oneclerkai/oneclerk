"""Gmail SMTP email service for OneClerk.

Sends verification emails and other transactional emails via Gmail App Password.
Falls back to the Resend-based notifications service when MAIL_PASSWORD is not set.
"""
from __future__ import annotations

import asyncio
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings

logger = logging.getLogger("oneclerk.email_service")


def _verification_email_html(verification_link: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e8eaf2">
        <div style="font-size:22px;font-weight:700;color:#111827">OneClerk.ai</div>
        <h1 style="font-size:24px;color:#111827;margin:24px 0 8px">Verify your email</h1>
        <p style="color:#4b5563;line-height:1.6">
          Click the button below to verify your email address and complete your OneClerk account setup.
        </p>
        <div style="text-align:center;margin:32px 0">
          <a href="{verification_link}"
             style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;
                    padding:16px 32px;border-radius:8px;font-weight:600;font-size:16px">
            Verify Email
          </a>
        </div>
        <p style="color:#6b7280;font-size:14px">
          This link expires in 24 hours. If you did not request this, you can safely ignore this email.
        </p>
        <p style="color:#6b7280;font-size:14px">Or copy and paste this link into your browser:</p>
        <p style="color:#4b5563;font-size:12px;word-break:break-all">{verification_link}</p>
      </div>
    </div>
    """


def _otp_email_html(otp: str) -> str:
    return f"""
    <div style="font-family:Inter,Arial,sans-serif;background:#f6f7fb;padding:32px">
      <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:14px;padding:32px;border:1px solid #e8eaf2">
        <div style="font-size:22px;font-weight:700;color:#111827">OneClerk.ai</div>
        <h1 style="font-size:24px;color:#111827;margin:24px 0 8px">Verify your email</h1>
        <p style="color:#4b5563;line-height:1.6">
          Use this one-time code to finish creating your OneClerk account.
        </p>
        <div style="font-size:36px;letter-spacing:8px;font-weight:800;color:#111827;
                    background:#f3f4f6;border-radius:12px;padding:18px;text-align:center;margin:24px 0">
          {otp}
        </div>
        <p style="color:#6b7280;font-size:14px">
          This code expires in 10 minutes. If you did not request it, you can ignore this email.
        </p>
      </div>
    </div>
    """


def _send_gmail(to_email: str, subject: str, html_body: str) -> None:
    """Send an email via Gmail SMTP using App Password (synchronous)."""
    mail_user = settings.MAIL_FROM or "noreply@oneclerk.ai"
    mail_password = settings.MAIL_PASSWORD

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"OneClerk <{mail_user}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(mail_user, mail_password)
        server.sendmail(mail_user, to_email, msg.as_string())


async def send_verification_email(email: str, verification_link: str) -> bool:
    """Send a verification link email via Gmail SMTP.

    Returns True if sent, False if Gmail is not configured.
    Raises on SMTP errors.
    """
    if not settings.MAIL_PASSWORD:
        logger.debug("MAIL_PASSWORD not set — skipping Gmail send for %s", email)
        return False

    subject = "Verify your OneClerk email"
    html = _verification_email_html(verification_link)

    await asyncio.to_thread(_send_gmail, email, subject, html)
    logger.info("Verification email sent to %s via Gmail", email)
    return True


async def send_otp_email(email: str, otp: str) -> bool:
    """Send an OTP code email via Gmail SMTP.

    Returns True if sent, False if Gmail is not configured.
    Raises on SMTP errors.
    """
    if not settings.MAIL_PASSWORD:
        logger.debug("MAIL_PASSWORD not set — skipping Gmail OTP send for %s", email)
        return False

    subject = "Your OneClerk verification code"
    html = _otp_email_html(otp)

    await asyncio.to_thread(_send_gmail, email, subject, html)
    logger.info("OTP email sent to %s via Gmail", email)
    return True
