-- Initial schema for the fundraiser cashbook.
--
-- Conventions:
--   * Money is stored as INTEGER minor units (KES cents): KES 1,250.50 = 125050.
--   * Instants are TEXT in UTC, RFC 3339 with a trailing Z, e.g. 2024-06-02T07:15:00Z.
--   * Calendar dates are TEXT 'YYYY-MM-DD' interpreted in Africa/Nairobi.

CREATE TABLE accounts (
    id          INTEGER PRIMARY KEY,
    name        TEXT    NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
    kind        TEXT    NOT NULL CHECK (kind IN ('mpesa', 'bank', 'cash')),
    -- Private. Last digits of the M-Pesa number, used to warn when a statement
    -- belongs to a different line.
    number_hint TEXT,
    created_at  TEXT    NOT NULL
);

CREATE TABLE fundraiser (
    id                        INTEGER PRIMARY KEY CHECK (id = 1),
    name                      TEXT    NOT NULL CHECK (length(trim(name)) > 0),
    description               TEXT    NOT NULL DEFAULT '',
    target_minor              INTEGER CHECK (target_minor IS NULL OR target_minor > 0),
    start_date                TEXT,
    -- Money the fundraiser already held before records started here.
    -- It is not a contribution and needs a date, a place and an explanation.
    opening_funds_minor       INTEGER NOT NULL DEFAULT 0 CHECK (opening_funds_minor >= 0),
    opening_funds_date        TEXT,
    opening_funds_note        TEXT    NOT NULL DEFAULT '',
    opening_funds_account_id  INTEGER REFERENCES accounts (id),
    anonymous_label           TEXT    NOT NULL DEFAULT 'Anonymous contributor',
    show_reference_hint       INTEGER NOT NULL DEFAULT 1 CHECK (show_reference_hint IN (0, 1)),
    show_promises             INTEGER NOT NULL DEFAULT 1 CHECK (show_promises IN (0, 1)),
    public_page_enabled       INTEGER NOT NULL DEFAULT 0 CHECK (public_page_enabled IN (0, 1)),
    is_demo                   INTEGER NOT NULL DEFAULT 0 CHECK (is_demo IN (0, 1)),
    updated_at                TEXT    NOT NULL,
    CHECK (
        opening_funds_minor = 0
        OR (opening_funds_date IS NOT NULL
            AND opening_funds_account_id IS NOT NULL
            AND length(trim(opening_funds_note)) > 0)
    )
);

-- The stable identity of a transaction plus its presentation fields.
-- Presentation can be edited in place; financial values live in versions.
CREATE TABLE transactions (
    id           INTEGER PRIMARY KEY,
    public_name  TEXT,                       -- NULL means anonymous
    description  TEXT NOT NULL DEFAULT '',   -- public description or expense purpose
    notes        TEXT NOT NULL DEFAULT '',   -- private
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);

-- Financial values. A correction adds a version; only the current version counts.
CREATE TABLE transaction_versions (
    id                      INTEGER PRIMARY KEY,
    transaction_id          INTEGER NOT NULL REFERENCES transactions (id),
    version                 INTEGER NOT NULL CHECK (version >= 1),
    is_current              INTEGER NOT NULL CHECK (is_current IN (0, 1)),
    removed                 INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
    kind                    TEXT    NOT NULL CHECK (kind IN (
                                'contribution', 'expense', 'charge', 'refund', 'reversal',
                                'transfer', 'personal', 'pledge', 'commitment')),
    direction               TEXT    CHECK (direction IN ('in', 'out')),
    amount_minor            INTEGER NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 10000000000),
    occurred_at             TEXT    NOT NULL,
    account_id              INTEGER REFERENCES accounts (id),
    to_account_id           INTEGER REFERENCES accounts (id),
    reference               TEXT,
    is_fee                  INTEGER NOT NULL DEFAULT 0 CHECK (is_fee IN (0, 1)),
    related_transaction_id  INTEGER REFERENCES transactions (id),
    counterparty            TEXT,       -- private: name / number as shown in the source
    reason                  TEXT,       -- why this version exists (NULL for version 1)
    created_at              TEXT    NOT NULL,
    UNIQUE (transaction_id, version),
    CHECK (version = 1 OR length(trim(coalesce(reason, ''))) > 0),
    CHECK (
        (kind IN ('pledge', 'commitment')
            AND account_id IS NULL AND to_account_id IS NULL AND direction IS NULL)
        OR (kind = 'transfer'
            AND account_id IS NOT NULL AND to_account_id IS NOT NULL
            AND to_account_id <> account_id AND direction = 'out')
        OR (kind NOT IN ('pledge', 'commitment', 'transfer')
            AND account_id IS NOT NULL AND to_account_id IS NULL AND direction IS NOT NULL)
    ),
    CHECK (kind <> 'contribution' OR direction = 'in'),
    CHECK (kind NOT IN ('expense', 'charge') OR direction = 'out'),
    CHECK (kind <> 'charge' OR is_fee = 1),
    CHECK (is_fee = 0 OR kind IN ('charge', 'personal', 'reversal'))
);

CREATE UNIQUE INDEX transaction_versions_one_current
    ON transaction_versions (transaction_id) WHERE is_current = 1;

-- One live money movement per account, reference, direction and line type.
-- A payment and its charge share an M-Pesa reference, as can a reversal,
-- so the reference alone is not unique.
CREATE UNIQUE INDEX transaction_versions_live_reference
    ON transaction_versions (account_id, reference, direction, is_fee)
    WHERE is_current = 1 AND removed = 0 AND reference IS NOT NULL;

CREATE INDEX transaction_versions_current_time
    ON transaction_versions (is_current, occurred_at);
CREATE INDEX transaction_versions_reference ON transaction_versions (reference);
CREATE INDEX transaction_versions_related ON transaction_versions (related_transaction_id);

-- Private evidence: pasted messages, receipts and statement files.
CREATE TABLE documents (
    id              INTEGER PRIMARY KEY,
    kind            TEXT    NOT NULL CHECK (kind IN ('sms', 'receipt', 'statement')),
    transaction_id  INTEGER REFERENCES transactions (id),
    text_content    TEXT,               -- the original SMS
    storage_name    TEXT    UNIQUE,     -- generated file name inside the uploads directory
    original_name   TEXT,
    content_type    TEXT,
    size_bytes      INTEGER,
    sha256          TEXT    NOT NULL,
    public_token    TEXT    UNIQUE,     -- set only while a receipt is published
    published_at    TEXT,
    created_at      TEXT    NOT NULL,
    CHECK ((kind = 'sms' AND text_content IS NOT NULL AND storage_name IS NULL)
        OR (kind <> 'sms' AND storage_name IS NOT NULL AND content_type IS NOT NULL)),
    CHECK (public_token IS NULL OR (kind = 'receipt' AND transaction_id IS NOT NULL))
);

CREATE INDEX documents_transaction ON documents (transaction_id);
CREATE INDEX documents_hash ON documents (kind, sha256);

CREATE TABLE statement_imports (
    id                     INTEGER PRIMARY KEY,
    account_id             INTEGER NOT NULL REFERENCES accounts (id),
    document_id            INTEGER NOT NULL REFERENCES documents (id),
    file_sha256            TEXT    NOT NULL,
    status                 TEXT    NOT NULL CHECK (status IN (
                               'queued', 'processing', 'ready', 'failed', 'discarded')),
    attempts               INTEGER NOT NULL DEFAULT 0,
    error_code             TEXT,
    error_message          TEXT,
    layout                 TEXT,
    holder_name            TEXT,       -- private
    holder_number          TEXT,       -- private
    period_start           TEXT,
    period_end             TEXT,
    opening_balance_minor  INTEGER,
    closing_balance_minor  INTEGER,
    balance_breaks         INTEGER,
    created_at             TEXT    NOT NULL,
    processed_at           TEXT,
    completed_at           TEXT,
    discarded_at           TEXT
);

-- The same file cannot be imported twice unless the earlier import was discarded.
CREATE UNIQUE INDEX statement_imports_live_file
    ON statement_imports (file_sha256) WHERE status <> 'discarded';
CREATE INDEX statement_imports_status ON statement_imports (status);

-- Rows extracted from a statement. Kept apart from canonical transactions.
CREATE TABLE statement_rows (
    id                         INTEGER PRIMARY KEY,
    import_id                  INTEGER NOT NULL REFERENCES statement_imports (id),
    position                   INTEGER NOT NULL,
    page                       INTEGER,
    receipt                    TEXT,
    completed_at               TEXT,
    details                    TEXT    NOT NULL,     -- private
    row_status                 TEXT,
    direction                  TEXT    CHECK (direction IN ('in', 'out')),
    amount_minor               INTEGER CHECK (amount_minor IS NULL OR amount_minor >= 0),
    balance_minor              INTEGER,
    is_fee                     INTEGER NOT NULL DEFAULT 0 CHECK (is_fee IN (0, 1)),
    parse_note                 TEXT,
    match_status               TEXT    NOT NULL CHECK (match_status IN (
                                   'matched', 'missing', 'conflict', 'review', 'no_effect')),
    transaction_id             INTEGER REFERENCES transactions (id),
    candidate_transaction_id   INTEGER REFERENCES transactions (id),
    match_method               TEXT,
    match_note                 TEXT,
    decided_at                 TEXT,
    UNIQUE (import_id, position),
    CHECK ((match_status = 'matched') = (transaction_id IS NOT NULL))
);

CREATE UNIQUE INDEX statement_rows_one_link_per_import
    ON statement_rows (import_id, transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX statement_rows_transaction ON statement_rows (transaction_id);
CREATE INDEX statement_rows_receipt ON statement_rows (receipt);

CREATE TABLE change_log (
    id         INTEGER PRIMARY KEY,
    at         TEXT    NOT NULL,
    entity     TEXT    NOT NULL,
    entity_id  INTEGER,
    action     TEXT    NOT NULL,
    summary    TEXT    NOT NULL,
    reason     TEXT,
    details    TEXT
);

CREATE INDEX change_log_entity ON change_log (entity, entity_id, id);

INSERT INTO accounts (id, name, kind, created_at)
VALUES (1, 'M-Pesa', 'mpesa', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
       (2, 'Cash held', 'cash', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT INTO fundraiser (id, name, updated_at)
VALUES (1, 'Our fundraiser', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
