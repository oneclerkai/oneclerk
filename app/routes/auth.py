from datetime import datetime, timedelta
import secrets

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import User
from app.services.notifications import send_email_otp, send_email_verification_link, send_sms_otp
from app.services.redis_client import get_redis, safe_delete, safe_get, safe_setex

router = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


def _hash_password(password: str) -> str:
    # bcrypt has a hard 72-byte limit on the password input.
    raw = password.encode("utf-8")[:72]
    return bcrypt.hashpw(raw, bcrypt.gensalt()).decode("utf-8")


def _verify_password(password: str, hashed: str) -> bool:
    raw = password.encode("utf-8")[:72]
    try:
        return bcrypt.checkpw(raw, hashed.encode("utf-8"))
    except ValueError:
        return False


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    name: str | None = None
    whatsapp_number: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class SendEmailOtpRequest(BaseModel):
    email: EmailStr


class VerifyEmailOtpSignupRequest(SignupRequest):
    otp: str


class VerifyEmailLinkRequest(BaseModel):
    token: str
    email: EmailStr
    password: str
    name: str | None = None
    whatsapp_number: str | None = None


class SendPhoneOtpRequest(BaseModel):
    phone_number: str


class VerifyPhoneOtpRequest(BaseModel):
    phone_number: str
    otp: str


class SendEmailVerificationLinkRequest(BaseModel):
    email: EmailStr


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


def _create_access_token(subject: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": subject, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def _otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _decode_redis(value: bytes | str | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return value


def _email_key(email: str) -> str:
    return f"email_otp:{email.strip().lower()}"


def _phone_key(phone_number: str) -> str:
    return f"phone_otp:{phone_number.strip()}"


def _email_verification_link_key(email: str) -> str:
    return f"email_verification_link:{email.strip().lower()}"


def _ensure_redis() -> None:
    if get_redis() is None:
        raise HTTPException(
            status_code=503,
            detail="Redis is not configured. Set REDIS_URL to use OTP verification.",
        )


def _user_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "whatsapp_number": user.whatsapp_number,
        "plan": user.plan,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "onboarding_completed": bool(user.onboarding_completed),
        "email_verified": bool(user.email_verified),
        "phone_verified": bool(user.phone_verified),
        "business_profile": user.business_profile or None,
    }


class OnboardingRequest(BaseModel):
    profile: dict
    completed: bool = True


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=data.email,
        hashed_password=_hash_password(data.password),
        name=data.name,
        whatsapp_number=data.whatsapp_number,
        email_verified=False,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


@router.post("/send-email-otp")
async def send_email_otp_route(
    data: SendEmailOtpRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    email = data.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    _ensure_redis()
    otp = _otp()
    await safe_setex(_email_key(email), 600, otp)
    try:
        sent = await send_email_otp(email, otp)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send email OTP: {exc}") from exc

    response = {"sent": sent, "expires_in_seconds": 600}
    if not settings.RESEND_API_KEY:
        response["dev_otp"] = otp
    return response


@router.post("/send-email-verification-link")
async def send_email_verification_link_route(
    data: SendEmailVerificationLinkRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Send a verification link instead of OTP for email verification."""
    email = data.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    _ensure_redis()
    # Generate a verification token
    verification_token = secrets.token_urlsafe(32)
    await safe_setex(_email_verification_link_key(email), 86400, verification_token)  # 24 hours
    
    # Build verification link pointing to frontend
    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    verification_link = f"{frontend_url}/verify-email?token={verification_token}&email={email}"
    
    try:
        sent = await send_email_verification_link(email, verification_link)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send email verification link: {exc}") from exc

    response = {"sent": sent, "expires_in_seconds": 86400}
    if not settings.RESEND_API_KEY:
        response["dev_link"] = verification_link
    return response


@router.post("/verify-email-link", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def verify_email_link_and_signup(
    data: VerifyEmailLinkRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify email via link and create account."""
    email = data.email.lower()
    stored = _decode_redis(await safe_get(_email_verification_link_key(email)))
    if not stored or stored != data.token.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        await safe_delete(_email_verification_link_key(email))
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=_hash_password(data.password),
        name=data.name,
        whatsapp_number=data.whatsapp_number,
        email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await safe_delete(_email_verification_link_key(email))

    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


@router.post(
    "/verify-email-otp-and-signup",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def verify_email_otp_and_signup(
    data: VerifyEmailOtpSignupRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email = data.email.lower()
    stored = _decode_redis(await safe_get(_email_key(email)))
    if not stored or stored != data.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired email verification code")

    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        await safe_delete(_email_key(email))
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=email,
        hashed_password=_hash_password(data.password),
        name=data.name,
        whatsapp_number=data.whatsapp_number,
        email_verified=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await safe_delete(_email_key(email))

    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    result = await db.execute(select(User).where(User.email == data.email))
    user = result.scalar_one_or_none()
    if not user or not _verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        user_id: str | None = payload.get("sub")
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid token") from exc

    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@router.post("/send-phone-otp")
async def send_phone_otp_route(
    data: SendPhoneOtpRequest,
    current_user: User = Depends(get_current_user),
) -> dict:
    _ensure_redis()
    phone_number = data.phone_number.strip()
    if not phone_number:
        raise HTTPException(status_code=400, detail="Phone number is required")

    otp = _otp()
    # Store with 10-minute TTL (600 seconds) per spec
    await safe_setex(_phone_key(phone_number), 600, otp)
    try:
        sent = await send_sms_otp(phone_number, otp)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send phone OTP: {exc}") from exc

    response: dict = {"sent": sent, "expires_in_seconds": 600}
    if not (
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_AUTH_TOKEN
        and settings.TWILIO_PHONE_NUMBER
    ):
        response["dev_otp"] = otp
    return response


@router.post("/verify-phone-otp")
async def verify_phone_otp_route(
    data: VerifyPhoneOtpRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    phone_number = data.phone_number.strip()
    stored = _decode_redis(await safe_get(_phone_key(phone_number)))
    if not stored or stored != data.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired phone verification code")

    current_user.whatsapp_number = phone_number
    current_user.phone_verified = True
    await db.commit()
    await db.refresh(current_user)
    await safe_delete(_phone_key(phone_number))
    return {"verified": True, "user": _user_dict(current_user)}


@router.get("/me")
async def me(current_user: User = Depends(get_current_user)) -> dict:
    return _user_dict(current_user)


class GoogleAuthRequest(BaseModel):
    credential: str


class GoogleLoginRequest(BaseModel):
    id_token: str


async def _verify_google_token(id_token_str: str) -> dict:
    """Verify a Google ID token and return the token info dict."""
    import httpx

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token_str},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    info = resp.json()
    if "error" in info:
        raise HTTPException(
            status_code=401,
            detail=f"Google token error: {info.get('error_description', info['error'])}",
        )

    # Verify audience if GOOGLE_CLIENT_ID is configured
    if settings.GOOGLE_CLIENT_ID:
        aud = info.get("aud", "")
        if aud != settings.GOOGLE_CLIENT_ID:
            raise HTTPException(status_code=401, detail="Google token audience mismatch")

    return info


async def _google_auth_flow(id_token_str: str, db: AsyncSession) -> TokenResponse:
    """Shared logic for both /google and /google-login endpoints."""
    try:
        info = await _verify_google_token(id_token_str)

        email = (info.get("email") or "").lower().strip()
        if not email:
            raise HTTPException(status_code=400, detail="Google account has no email address")

        name = info.get("name") or info.get("given_name") or None

        existing = await db.execute(select(User).where(User.email == email))
        user = existing.scalar_one_or_none()

        if user is None:
            # Auto-create account for Google OAuth users (email already verified by Google)
            user = User(
                email=email,
                hashed_password=_hash_password(secrets.token_urlsafe(32)),
                name=name,
                email_verified=True,
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)

        return TokenResponse(access_token=_create_access_token(user.id), user=_user_dict(user))

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Google sign-in failed: {exc}") from exc


@router.post("/google", response_model=TokenResponse)
async def google_auth(data: GoogleAuthRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Legacy endpoint — accepts 'credential' field from @react-oauth/google."""
    return await _google_auth_flow(data.credential, db)


@router.post("/google-login", response_model=TokenResponse)
async def google_login(data: GoogleLoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    """Google OAuth login — accepts 'id_token' field from frontend."""
    return await _google_auth_flow(data.id_token, db)


@router.post("/logout")
async def logout() -> dict:
    """Logout endpoint — client should clear the token on their side."""
    return {"logged_out": True}


@router.post("/send-verification-email")
async def send_verification_email_route(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Send a verification email to the currently logged-in user.

    Used when a user is already logged in but hasn't verified their email yet.
    """
    if current_user.email_verified:
        return {"sent": False, "message": "Email is already verified"}

    _ensure_redis()
    verification_token = secrets.token_urlsafe(32)
    redis_key = f"email_verify_user:{current_user.id}"
    await safe_setex(redis_key, 86400, verification_token)

    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    verification_link = (
        f"{frontend_url}/verify-email"
        f"?token={verification_token}&user_id={current_user.id}&mode=verify"
    )

    try:
        sent = await send_email_verification_link(current_user.email, verification_link)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not send verification email: {exc}") from exc

    response: dict = {"sent": sent, "expires_in_seconds": 86400}
    if not (settings.RESEND_API_KEY or settings.MAIL_PASSWORD):
        response["dev_link"] = verification_link
    return response


@router.get("/verify-email")
async def verify_email_token(
    token: str,
    user_id: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Verify email via JWT token for already-registered users.

    Called when a logged-in user clicks the verification link in their email.
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")

    redis_key = f"email_verify_user:{user_id}"
    stored_raw = await safe_get(redis_key)
    stored = _decode_redis(stored_raw)
    if not stored or stored != token.strip():
        raise HTTPException(status_code=400, detail="Invalid or expired verification link")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.email_verified = True
    await db.commit()
    await db.refresh(user)
    await safe_delete(redis_key)

    return {"verified": True, "user": _user_dict(user)}


@router.post("/resend-verification-email")
async def resend_verification_email_route(
    current_user: User = Depends(get_current_user),
) -> dict:
    """Resend the verification email to the currently logged-in user."""
    if current_user.email_verified:
        return {"sent": False, "message": "Email is already verified"}

    _ensure_redis()
    verification_token = secrets.token_urlsafe(32)
    redis_key = f"email_verify_user:{current_user.id}"
    await safe_setex(redis_key, 86400, verification_token)

    frontend_url = settings.FRONTEND_URL or "http://localhost:3000"
    verification_link = (
        f"{frontend_url}/verify-email"
        f"?token={verification_token}&user_id={current_user.id}&mode=verify"
    )

    try:
        sent = await send_email_verification_link(current_user.email, verification_link)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not resend verification email: {exc}") from exc

    response: dict = {"sent": sent, "expires_in_seconds": 86400}
    if not (settings.RESEND_API_KEY or settings.MAIL_PASSWORD):
        response["dev_link"] = verification_link
    return response


@router.post("/onboarding")
async def save_onboarding(
    data: OnboardingRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    current_user.business_profile = data.profile
    current_user.onboarding_completed = data.completed
    if data.profile.get("business_name") and not current_user.name:
        current_user.name = data.profile.get("contact_name") or current_user.name
    if data.profile.get("whatsapp_number") and not current_user.whatsapp_number:
        current_user.whatsapp_number = data.profile.get("whatsapp_number")
    await db.commit()
    await db.refresh(current_user)
    return _user_dict(current_user)
