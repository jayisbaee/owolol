-- Run this once against your Postgres database.
-- Railway: open the Postgres plugin's "Query" tab and paste this in,
-- or run `psql "$DATABASE_URL" -f schema.sql` from your machine.

CREATE TABLE IF NOT EXISTS users (
    user_id      TEXT PRIMARY KEY,
    balance      BIGINT NOT NULL DEFAULT 0,
    bank         BIGINT NOT NULL DEFAULT 0,
    last_daily   TIMESTAMPTZ,
    last_work    TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
