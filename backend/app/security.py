import hashlib
import hmac
import secrets
import time
from urllib.parse import urlsplit

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select

from . import config
from .db import DB, Asset, Case, CaseEvidence, CaseMember, Event, CaseVideo, Session, User


def require_local_access(request: Request):
    if config.AUTH_MODE != "local":
        raise HTTPException(404, "Local access is not enabled")
    loopback = {"localhost", "127.0.0.1", "::1"}
    host = request.headers.get("x-forwarded-host", request.headers.get("host", ""))
    origin = request.headers.get("origin")
    try:
        valid_host = urlsplit("//" + host).hostname in loopback
        valid_origin = not origin or urlsplit(origin).hostname in loopback
    except ValueError:
        valid_host = valid_origin = False
    if (
        config.PRODUCTION
        or not request.client
        or request.client.host not in loopback
        or not valid_host
        or not valid_origin
        or request.headers.get("sec-fetch-site") == "cross-site"
    ):
        raise HTTPException(403, "Local access is restricted to this computer")


def hash_password(password):
    salt = secrets.token_hex(16)
    result = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()
    return f"{salt}:{result}"


def verify_password(password, stored):
    salt, digest = stored.split(":")
    return hmac.compare_digest(hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex(), digest)


def current_user(request: Request):
    token = request.cookies.get("sensa_session", "")
    with DB() as db:
        session = db.get(Session, hashlib.sha256(token.encode()).hexdigest())
        if not session or session.expires < time.time():
            raise HTTPException(401, "Sign in to continue")
        user = db.get(User, session.user_id)
        if not user:
            raise HTTPException(401, "Session expired")
        return user


def writer(user: User = Depends(current_user)):
    if user.role == "viewer":
        raise HTTPException(403, "Your role permits viewing only")
    return user


def administrator(user: User = Depends(current_user)):
    if user.role != "admin":
        raise HTTPException(403, "Administrator permission required")
    return user


def allowed_case(db, user, case):
    return case and (
        user.role == "admin" or case.owner_id == user.id or db.get(CaseMember, (case.id, user.id)) is not None
    )


def require_case(db, user, case_id):
    case = db.get(Case, case_id)
    if not allowed_case(db, user, case):
        raise HTTPException(404, "Investigation not found")
    return case


def allowed_asset(db, user, asset):
    if not asset:
        return False
    if user.role == "admin" or asset.owner_id == user.id:
        return True
    cases = db.scalars(
        select(Case)
        .join(CaseEvidence, CaseEvidence.case_id == Case.id)
        .join(Event, CaseEvidence.event_id == Event.id)
        .where(Event.asset_id == asset.id)
    ).all()
    cases += list(
        db.scalars(select(Case).join(CaseVideo, CaseVideo.case_id == Case.id).where(CaseVideo.asset_id == asset.id))
    )
    return any(allowed_case(db, user, c) for c in cases)


def require_asset(db, user, asset_id):
    asset = db.get(Asset, asset_id)
    if not allowed_asset(db, user, asset):
        raise HTTPException(404, "Recording not found")
    if asset.status == "quarantined":
        raise HTTPException(410, "Recording is in reversible quarantine; an administrator can restore it")
    return asset
