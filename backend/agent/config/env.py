"""
Alembic env.py — SENSA
Reads DATABASE_URL from environment variable so we never hardcode credentials.
Supports both sync (for alembic CLI) and async (for online migrations).
"""
import asyncio
import os
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Import all models so Alembic knows about every table
from database.models.database import Base  # noqa: F401 — side-effect import registers all models

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Override the sqlalchemy.url from environment variable
# This means .env is the single source of truth — alembic.ini URL is ignored
db_url = os.getenv("DATABASE_URL", "")
if db_url.startswith("postgresql+asyncpg://"):
    # Alembic sync runner needs a sync driver for the CLI
    # We use asyncpg at runtime but need psycopg2-style for CLI migrations
    # Solution: use the asyncpg URL but wrap it for sync context
    pass
config.set_main_option("sqlalchemy.url", db_url)


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (generates SQL without connecting)."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


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
    run_migrations_offline()
else:
    run_migrations_online()
