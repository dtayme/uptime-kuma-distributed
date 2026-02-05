const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..", "..");

const stubServer = {
    io: {
        to() {
            return { emit() {} };
        },
    },
    async getClientIPwithProxy(_remoteAddress, headers) {
        return headers["x-test-ip"] || "127.0.0.1";
    },
};

const stubUptimeKumaServer = {
    getInstance: () => stubServer,
};

const stubMonitor = {
    async getPreviousHeartbeat() {
        return null;
    },
    async isUnderMaintenance() {
        return false;
    },
    isImportantBeat() {
        return true;
    },
    isImportantForNotification() {
        return false;
    },
    async sendNotification() {},
    sendStats() {},
};

const stubR = {
    async findOne(_table, _where, params) {
        if (params && params[0] === "valid-token") {
            return {
                id: 1,
                user_id: 1,
                maxretries: 0,
                resendInterval: 0,
                isUpsideDown() {
                    return false;
                },
            };
        }
        return null;
    },
    dispense() {
        return {
            toJSON() {
                return this;
            },
        };
    },
    isoDateTimeMillis(date) {
        return date.toISOString();
    },
    async store(bean) {
        return bean;
    },
};

const stubUptimeCalculator = {
    async getUptimeCalculator() {
        return {
            async update() {
                return new Date();
            },
        };
    },
};

class StubPrometheus {
    update() {}
}

function stubModule(modulePath, exports) {
    require.cache[modulePath] = {
        id: modulePath,
        filename: modulePath,
        loaded: true,
        exports,
    };
}

stubModule(require.resolve("redbean-node"), { R: stubR });
stubModule(path.join(repoRoot, "server", "uptime-kuma-server.js"), { UptimeKumaServer: stubUptimeKumaServer });
stubModule(path.join(repoRoot, "server", "model", "monitor.js"), stubMonitor);
stubModule(path.join(repoRoot, "server", "uptime-calculator.js"), { UptimeCalculator: stubUptimeCalculator });
stubModule(path.join(repoRoot, "server", "prometheus.js"), { Prometheus: StubPrometheus });

const router = require(path.join(repoRoot, "server", "routers", "api-router.js"));

async function createTestServer() {
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(router);

    const server = await new Promise((resolve) => {
        const instance = app.listen(0, () => resolve(instance));
    });

    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    async function request(pathname, options = {}) {
        const res = await fetch(`${baseUrl}${pathname}`, options);
        let body;
        try {
            body = await res.json();
        } catch {
            body = { error: "non-json" };
        }
        return { status: res.status, body };
    }

    return {
        server,
        request,
    };
}

test("push endpoint supports header tokens and rate limiting", async () => {
    const { server, request } = await createTestServer();

    try {
        const missingToken = await request("/api/push", { method: "POST" });
        assert.equal(missingToken.status, 400);
        assert.equal(missingToken.body.ok, false);

        const headerToken = await request("/api/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Push-Token": "valid-token",
                "X-Test-IP": "127.0.0.1",
            },
            body: JSON.stringify({ status: "up", msg: "OK" }),
        });
        assert.equal(headerToken.status, 200);
        assert.equal(headerToken.body.ok, true);

        const legacyToken = await request("/api/push/valid-token?status=up&msg=OK", {
            method: "GET",
            headers: {
                "X-Test-IP": "127.0.0.1",
            },
        });
        assert.equal(legacyToken.status, 200);
        assert.equal(legacyToken.body.ok, true);

        let lastRateLimitResponse;
        for (let i = 0; i < 70; i++) {
            lastRateLimitResponse = await request("/api/push", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Push-Token": "valid-token",
                    "X-Test-IP": "127.0.0.1",
                },
                body: JSON.stringify({ status: "up", msg: "OK" }),
            });
        }

        assert.equal(lastRateLimitResponse.status, 429);
        assert.equal(lastRateLimitResponse.body.ok, false);
    } finally {
        server.close();
    }
});
