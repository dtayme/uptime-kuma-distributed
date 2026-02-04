const express = require("express");
const crypto = require("crypto");
const dayjs = require("dayjs");
const { R } = require("redbean-node");
const { sendHttpError } = require("../util-server");
const { log } = require("../../src/util");

const router = express.Router();

function pollersEnabled() {
    return process.env.ENABLE_REMOTE_POLLERS === "1" || process.env.ENABLE_POLLERS === "1";
}

function getRegistrationToken(request) {
    return request.headers["x-poller-registration-token"] || request.body?.registration_token || "";
}

function hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
}

function nowIso() {
    return R.isoDateTimeMillis(dayjs.utc());
}

async function requirePollerAuth(request, response, next) {
    if (!pollersEnabled()) {
        return response.status(404).json({ ok: false, msg: "Pollers are disabled" });
    }

    const authHeader = request.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    const altToken = request.headers["x-poller-token"];
    const rawToken = token || altToken || "";

    if (!rawToken) {
        return response.status(401).json({ ok: false, msg: "Missing poller token" });
    }

    const tokenHash = hashToken(rawToken);
    const pollerToken = await R.findOne("poller_token", "hashed_token = ? AND active = 1", [tokenHash]);
    if (!pollerToken) {
        return response.status(401).json({ ok: false, msg: "Invalid poller token" });
    }

    const poller = await R.findOne("poller", "id = ?", [pollerToken.poller_id]);
    if (!poller) {
        return response.status(401).json({ ok: false, msg: "Unknown poller" });
    }

    request.poller = poller;
    request.pollerToken = pollerToken;
    next();
}

router.post("/api/poller/register", async (request, response) => {
    try {
        if (!pollersEnabled()) {
            return response.status(404).json({ ok: false, msg: "Pollers are disabled" });
        }

        const registrationSecret = process.env.POLLER_REGISTRATION_TOKEN || "";
        if (!registrationSecret) {
            return response.status(503).json({ ok: false, msg: "Registration is disabled" });
        }

        const providedToken = getRegistrationToken(request);
        if (!providedToken || providedToken !== registrationSecret) {
            return response.status(403).json({ ok: false, msg: "Invalid registration token" });
        }

        const payload = request.body || {};
        const now = nowIso();
        const pollerBean = R.dispense("poller");
        pollerBean.name = payload.name || `poller-${Date.now()}`;
        pollerBean.region = payload.region || "local";
        pollerBean.datacenter = payload.datacenter || "";
        const capabilities =
            typeof payload.capabilities === "string" ? payload.capabilities : JSON.stringify(payload.capabilities || {});
        pollerBean.capabilities = capabilities;
        pollerBean.version = payload.version || "";
        pollerBean.status = "offline";
        pollerBean.queue_depth = 0;
        pollerBean.assignment_version = 0;
        pollerBean.created_at = now;
        pollerBean.updated_at = now;
        await R.store(pollerBean);

        const rawToken = crypto.randomBytes(32).toString("hex");
        const pollerToken = R.dispense("poller_token");
        pollerToken.poller_id = pollerBean.id;
        pollerToken.hashed_token = hashToken(rawToken);
        pollerToken.active = true;
        pollerToken.created_at = now;
        pollerToken.expires_at = null;
        await R.store(pollerToken);

        log.info("poller", `Registered poller ${pollerBean.id}`);

        return response.json({
            ok: true,
            poller_id: pollerBean.id,
            access_token: rawToken,
        });
    } catch (error) {
        sendHttpError(response, error.message);
    }
});

router.post("/api/poller/heartbeat", requirePollerAuth, async (request, response) => {
    try {
        const payload = request.body || {};
        const poller = request.poller;
        const status = ["online", "degraded", "offline"].includes(payload.status) ? payload.status : "online";

        poller.last_heartbeat_at = nowIso();
        poller.status = status;
        const parsedQueueDepth = Number.parseInt(payload.queue_depth, 10);
        poller.queue_depth = Number.isNaN(parsedQueueDepth) ? poller.queue_depth : parsedQueueDepth;
        poller.version = payload.version || poller.version;
        poller.region = payload.region || poller.region;
        poller.datacenter = payload.datacenter || poller.datacenter;
        if (payload.capabilities) {
            poller.capabilities =
                typeof payload.capabilities === "string" ? payload.capabilities : JSON.stringify(payload.capabilities);
        }
        poller.updated_at = nowIso();

        await R.store(poller);

        return response.json({
            ok: true,
            assignment_version: poller.assignment_version || 0,
        });
    } catch (error) {
        sendHttpError(response, error.message);
    }
});

router.get("/api/poller/assignments", requirePollerAuth, async (request, response) => {
    try {
        const poller = request.poller;
        poller.last_assignment_pull_at = nowIso();
        poller.updated_at = nowIso();
        await R.store(poller);

        const version = poller.assignment_version || 0;
        return response.json({
            ok: true,
            assignment_version: version,
            assignments: [],
        });
    } catch (error) {
        sendHttpError(response, error.message);
    }
});

router.post("/api/poller/results", requirePollerAuth, async (request, response) => {
    try {
        const poller = request.poller;
        const payload = request.body || {};
        const results = Array.isArray(payload.results) ? payload.results : [];

        poller.last_results_at = nowIso();
        poller.updated_at = nowIso();
        await R.store(poller);

        return response.json({
            ok: true,
            accepted: results.length,
        });
    } catch (error) {
        sendHttpError(response, error.message);
    }
});

module.exports = router;
