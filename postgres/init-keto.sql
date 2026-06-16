-- Runs once on a fresh Postgres volume (docker-entrypoint-initdb.d).
-- Creates a separate database for Ory Keto on the same Postgres server.
CREATE DATABASE keto;
