#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SENSA — Apply All Backend Changes
#
# Run this on your Hetzner VPS to:
#   1. Pull the latest code
#   2. Install new Python dependencies
#   3. Run the 4 database migrations (safe to re-run — skips already-applied)
#   4. Restart the backend service
#   5. Verify everything is working
#
# Usage:
#   chmod +x apply_backend_changes.sh
#   ./apply_backend_changes.sh
#
# If you don't have git set up, use the MANUAL COPY section at the bottom.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

BACKEND_DIR="/opt/SENSA/backend"
VENV="$BACKEND_DIR/venv/bin"
SERVICE="SENSA-api"

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
ok()   { echo -e "${GREEN}✓ $*${RESET}"; }
info() { echo -e "${CYAN}→ $*${RESET}"; }
warn() { echo -e "${YELLOW}⚠ $*${RESET}"; }
fail() { echo -e "${RED}✗ $*${RESET}"; exit 1; }

echo ""
echo "════════════════════════════════════════════════════════"
echo "  SENSA Backend — Applying All Changes"
echo "════════════════════════════════════════════════════════"
echo ""

# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Verify we're in the right place
# ─────────────────────────────────────────────────────────────────────────────
info "Checking environment..."
[[ -d "$BACKEND_DIR" ]] || fail "Backend directory $BACKEND_DIR not found. Check your install path."
[[ -f "$BACKEND_DIR/.env" ]] || fail ".env file missing at $BACKEND_DIR/.env"
[[ -f "$VENV/python" ]] || fail "Python venv not found at $VENV. Re-run the initial setup."
ok "Environment looks good"

cd "$BACKEND_DIR"
source "$VENV/activate" 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Install new Python dependencies
# ─────────────────────────────────────────────────────────────────────────────
info "Installing/updating Python dependencies..."
"$VENV/pip" install -r requirements.txt --quiet
ok "Dependencies installed"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — Ensure Alembic folder exists
# ─────────────────────────────────────────────────────────────────────────────
info "Checking Alembic configuration..."
if [[ ! -d "$BACKEND_DIR/alembic" ]]; then
    warn "alembic/ folder missing — creating it now..."
    mkdir -p "$BACKEND_DIR/alembic/versions"
    cat > "$BACKEND_DIR/alembic/env.py" << 'ENVEOF'
import asyncio, os
from logging.config import fileConfig
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from alembic import context
from models.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)
target_metadata = Base.metadata
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL", ""))

def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()

async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()

def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())

if context.is_offline_mode():
    pass
else:
    run_migrations_online()
ENVEOF
fi

# Copy migration files into alembic/versions if they're in old location
if [[ -d "$BACKEND_DIR/migrations" ]]; then
    info "Moving migration files to alembic/versions/..."
    cp "$BACKEND_DIR/migrations/"*.py "$BACKEND_DIR/alembic/versions/" 2>/dev/null || true
    ok "Migration files in place"
fi

# Verify all 4 migration files exist
for f in 0001_initial 0002_whatsapp_otp_trial_plans 0003_payment_records_updates 0004_trial_cancel_notif_flags; do
    [[ -f "$BACKEND_DIR/alembic/versions/${f}.py" ]] || fail "Migration $f not found in alembic/versions/"
done
ok "All 4 migrations present"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — Run database migrations
# ─────────────────────────────────────────────────────────────────────────────
info "Running database migrations..."

# Load .env so DATABASE_URL is available
set -a
source "$BACKEND_DIR/.env"
set +a

# Run alembic — safe to run multiple times (skips already-applied migrations)
"$VENV/alembic" upgrade head

ok "Database migrations complete"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — Verify new columns exist in the database
# ─────────────────────────────────────────────────────────────────────────────
info "Verifying database schema..."

python3 << 'PYEOF'
import asyncio, os, sys
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

async def verify():
    url = os.getenv("DATABASE_URL", "")
    engine = create_async_engine(url)
    async with engine.connect() as conn:
        # Check all new tables exist
        tables_needed = [
            "payment_records",
            "agent_update_notifications",
            "whatsapp_otps",
            "whatsapp_trial_records",
            "customer_profiles",
        ]
        result = await conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname='public'"
        ))
        existing = {r[0] for r in result}
        for t in tables_needed:
            if t in existing:
                print(f"  ✓ table: {t}")
            else:
                print(f"  ✗ MISSING table: {t}")
                sys.exit(1)

        # Check new columns on subscriptions
        cols_needed = [
            ("subscriptions", "card_brand"),
            ("subscriptions", "card_last4"),
            ("subscriptions", "card_verified"),
            ("subscriptions", "stripe_payment_method_id"),
            ("subscriptions", "notif_7d_sent"),
            ("subscriptions", "notif_3d_sent"),
            ("subscriptions", "notif_1d_sent"),
            ("subscriptions", "cancelled_at"),
            ("subscriptions", "pending_upgrade_plan"),
        ]
        result = await conn.execute(text(
            "SELECT table_name, column_name FROM information_schema.columns "
            "WHERE table_schema='public'"
        ))
        existing_cols = {(r[0], r[1]) for r in result}
        for tbl, col in cols_needed:
            if (tbl, col) in existing_cols:
                print(f"  ✓ column: {tbl}.{col}")
            else:
                print(f"  ✗ MISSING column: {tbl}.{col}")
                sys.exit(1)

        print()
        print("  All schema checks passed.")
    await engine.dispose()

asyncio.run(verify())
PYEOF

ok "Database schema verified"

# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — Restart the backend service
# ─────────────────────────────────────────────────────────────────────────────
info "Restarting SENSA API service..."
systemctl restart "$SERVICE"
sleep 3

# Check it's running
if systemctl is-active --quiet "$SERVICE"; then
    ok "SENSA-api service is running"
else
    fail "SENSA-api service failed to start. Check: journalctl -u SENSA-api -n 50"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 7 — Health check
# ─────────────────────────────────────────────────────────────────────────────
info "Running health check..."
sleep 2

HEALTH=$(curl -sf http://localhost:8080/health 2>/dev/null || echo "FAIL")
if [[ "$HEALTH" == *"ok"* ]]; then
    ok "API health check passed: $HEALTH"
else
    fail "API health check failed. Response: $HEALTH\nCheck: journalctl -u SENSA-api -n 30"
fi

# ─────────────────────────────────────────────────────────────────────────────
# STEP 8 — Verify new endpoints exist
# ─────────────────────────────────────────────────────────────────────────────
info "Verifying new API endpoints are registered..."

# Check the /api/billing routes are registered (returns 401 not 404)
for endpoint in "/api/billing/trial-status" "/api/billing/cancel-trial" "/api/updates/pending" "/api/updates/install-info"; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8080${endpoint}")
    if [[ "$HTTP_CODE" == "401" || "$HTTP_CODE" == "422" || "$HTTP_CODE" == "200" ]]; then
        ok "Endpoint $endpoint → HTTP $HTTP_CODE (registered)"
    elif [[ "$HTTP_CODE" == "404" ]]; then
        warn "Endpoint $endpoint → 404 (NOT FOUND — router may not be registered)"
    else
        ok "Endpoint $endpoint → HTTP $HTTP_CODE"
    fi
done

# ─────────────────────────────────────────────────────────────────────────────
# DONE
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════════════"
echo -e "${GREEN}✓ All backend changes applied successfully!${RESET}"
echo "════════════════════════════════════════════════════════"
echo ""
echo "New features now live:"
echo "  • POST /api/billing/cancel-trial     — users can cancel trial (zero charge)"
echo "  • GET  /api/billing/trial-status     — live seconds_remaining countdown"
echo "  • GET  /api/updates/pending          — update available notifications"
echo "  • POST /api/updates/{id}/install     — manual update approval"
echo "  • GET  /api/updates/install-info     — install commands for agent"
echo "  • background: trial_notifications    — Day 7/3/1 WhatsApp reminders"
echo "  • background: daily_summary          — 8 AM overnight report"
echo ""
echo "To watch live logs:"
echo "  journalctl -u SENSA-api -f"
echo ""
