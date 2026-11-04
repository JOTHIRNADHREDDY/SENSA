"""Opt-in local demo bootstrap. Generates credentials; never ships a fixed password."""

import json
import secrets
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / "backend"))


def main():
    from sqlalchemy import select
    from app.config import DATA
    from app.db import DB, Case, CaseEvidence, Event, User, audit, migrate
    from app.security import hash_password
    from app.workflows import seed_demo

    migrate()
    with DB.begin() as db:
        user = db.scalars(select(User).limit(1)).first()
        if not user:
            password = secrets.token_urlsafe(24)
            user = User(
                email="demo@sensa.local",
                name="Alex Morgan",
                role="admin",
                password=hash_password(password),
            )
            db.add(user)
            db.flush()
            (DATA / "local-access.json").write_text(
                json.dumps(
                    {
                        "email": user.email,
                        "password": password,
                        "url": "http://127.0.0.1:3001",
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
            print(
                "Generated demo access saved privately to data/local-access.json (ignored by Git)."
            )
        owner_id = user.id
    ids = seed_demo(owner_id)
    with DB.begin() as db:
        case = db.scalars(select(Case).where(Case.owner_id == owner_id)).first()
        if not case:
            case = Case(
                owner_id=owner_id,
                title="East exit activity review",
                description="Review the observed movement near the east exit. Authorization and intent remain unknown.",
                purpose="Authorized synthetic warehouse operations review",
            )
            db.add(case)
            db.flush()
            events = db.scalars(
                select(Event).where(Event.asset_id == ids[-1]).order_by(Event.start)
            ).all()
            for event in events:
                db.add(CaseEvidence(case_id=case.id, event_id=event.id))
            print("Created a demo investigation with source-linked synthetic evidence.")
    audit(owner_id, "demo.bootstrap", detail={"synthetic_sources": len(ids)})
    print("Demo ready. No Meta inference was called.")


if __name__ == "__main__":
    main()
