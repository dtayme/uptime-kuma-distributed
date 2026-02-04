function initSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS poller_queue (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            monitor_id INTEGER NOT NULL,
            ts INTEGER NOT NULL,
            status INTEGER NOT NULL,
            latency_ms INTEGER,
            msg TEXT,
            meta TEXT,
            attempts INTEGER NOT NULL DEFAULT 0,
            next_retry_at INTEGER
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS poller_assignments (
            assignment_version INTEGER NOT NULL,
            snapshot_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS poller_state (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );
    `);
}

function queueDepth(db) {
    const row = db.prepare("SELECT COUNT(*) AS count FROM poller_queue").get();
    return row ? row.count : 0;
}

function enqueueResult(db, record) {
    const stmt = db.prepare(`
        INSERT INTO poller_queue (monitor_id, ts, status, latency_ms, msg, meta, attempts, next_retry_at)
        VALUES (@monitor_id, @ts, @status, @latency_ms, @msg, @meta, @attempts, @next_retry_at)
    `);

    stmt.run({
        monitor_id: record.monitorId,
        ts: record.ts,
        status: record.status,
        latency_ms: record.latencyMs ?? null,
        msg: record.msg ?? null,
        meta: record.meta ? JSON.stringify(record.meta) : null,
        attempts: record.attempts ?? 0,
        next_retry_at: record.nextRetryAt ?? null,
    });
}

function dequeueBatch(db, limit) {
    return db.prepare(`
        SELECT * FROM poller_queue
        WHERE next_retry_at IS NULL OR next_retry_at <= @now
        ORDER BY ts ASC
        LIMIT @limit
    `).all({ now: Date.now(), limit });
}

function markDelivered(db, ids) {
    if (!ids.length) {
        return;
    }

    const placeholders = ids.map(() => "?").join(",");
    db.prepare(`DELETE FROM poller_queue WHERE id IN (${placeholders})`).run(...ids);
}

function pruneExpired(db, retentionSeconds) {
    const cutoff = Date.now() - retentionSeconds * 1000;
    db.prepare("DELETE FROM poller_queue WHERE ts < ?").run(cutoff);
}

module.exports = {
    initSchema,
    queueDepth,
    enqueueResult,
    dequeueBatch,
    markDelivered,
    pruneExpired,
};
