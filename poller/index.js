const path = require("path");

const { loadConfig } = require("./config");
const { createLogger } = require("./logger");
const { openDatabase } = require("./db");
const { initSchema, queueDepth, pruneExpired } = require("./queue");
const { PollerApiClient } = require("./api-client");

const config = loadConfig();
const log = createLogger("poller");

const packageJsonPath = path.resolve(__dirname, "..", "package.json");
const appVersion = require(packageJsonPath).version;

const db = openDatabase(config.dbPath);
initSchema(db);

const apiClient = new PollerApiClient({
    baseUrl: config.centralUrl,
    accessToken: config.accessToken,
    pollerId: config.pollerId,
});

log.info(`Poller scaffold starting (version ${appVersion})`);
log.info(`Central URL: ${config.centralUrl}`);
log.info(`Queue DB: ${config.dbPath}`);

const isConfigured = Boolean(config.pollerId && config.accessToken);
if (!isConfigured) {
    log.warn("POLLER_ID or POLLER_TOKEN not set. Running in idle mode.");
}

let assignmentVersion = null;

async function heartbeat() {
    if (!isConfigured) {
        return;
    }

    const payload = {
        poller_id: config.pollerId,
        region: config.region,
        datacenter: config.datacenter,
        version: appVersion,
        queue_depth: queueDepth(db),
        capabilities: config.capabilities,
        status: "online",
    };

    try {
        await apiClient.heartbeat(payload);
    } catch (error) {
        log.warn(`Heartbeat failed: ${error.message}`);
    }
}

async function refreshAssignments() {
    if (!isConfigured) {
        return;
    }

    try {
        const response = await apiClient.fetchAssignments(assignmentVersion);
        if (response && response.assignment_version !== undefined) {
            assignmentVersion = response.assignment_version;
        }
    } catch (error) {
        log.warn(`Assignment refresh failed: ${error.message}`);
    }
}

function maintenance() {
    pruneExpired(db, config.queueRetentionSeconds);
}

setInterval(() => {
    heartbeat();
}, config.heartbeatIntervalMs);

setInterval(() => {
    refreshAssignments();
}, config.assignmentsIntervalMs);

setInterval(() => {
    maintenance();
}, Math.max(config.uploadIntervalMs, 10000));

heartbeat();
refreshAssignments();
