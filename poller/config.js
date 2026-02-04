const path = require("path");

function parseNumber(value, fallback) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? fallback : parsed;
}

function parseJson(value, fallback) {
    if (!value) {
        return fallback;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function loadConfig() {
    return {
        centralUrl: process.env.POLLER_SERVER_URL || "http://localhost:3001",
        pollerId: process.env.POLLER_ID || null,
        accessToken: process.env.POLLER_TOKEN || null,
        region: process.env.POLLER_REGION || "local",
        datacenter: process.env.POLLER_DATACENTER || "",
        capabilities: parseJson(process.env.POLLER_CAPABILITIES_JSON, {}),
        dbPath: process.env.POLLER_DB_PATH || path.resolve(process.cwd(), "poller-data", "poller.sqlite"),
        heartbeatIntervalMs: parseNumber(process.env.POLLER_HEARTBEAT_INTERVAL_SECONDS, 15) * 1000,
        assignmentsIntervalMs: parseNumber(process.env.POLLER_ASSIGNMENTS_INTERVAL_SECONDS, 30) * 1000,
        uploadIntervalMs: parseNumber(process.env.POLLER_UPLOAD_INTERVAL_SECONDS, 10) * 1000,
        schedulerIntervalMs: parseNumber(process.env.POLLER_SCHEDULER_INTERVAL_SECONDS, 5) * 1000,
        queueRetentionSeconds: parseNumber(process.env.POLLER_QUEUE_RETENTION_SECONDS, 86400),
        batchSize: parseNumber(process.env.POLLER_UPLOAD_BATCH_SIZE, 50),
    };
}

module.exports = {
    loadConfig,
};
