const axios = require("axios");
const https = require("https");
const http = require("http");
const net = require("net");
const { Resolver } = require("node:dns/promises");
const ping = require("@louislam/ping");
const dayjs = require("dayjs");
const { UP, DOWN, evaluateJsonQuery } = require("../src/util");

const acceptedStatusCodeDefault = ["200-299"];

function normalizeAcceptedStatuscodes(value) {
    if (!value) {
        return acceptedStatusCodeDefault;
    }
    if (Array.isArray(value)) {
        return value;
    }
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : acceptedStatusCodeDefault;
    } catch {
        return acceptedStatusCodeDefault;
    }
}

function isStatusCodeAccepted(status, acceptedStatuscodes) {
    if (!acceptedStatuscodes || acceptedStatuscodes.length === 0) {
        return status >= 200 && status <= 299;
    }

    return acceptedStatuscodes.some((rule) => {
        if (typeof rule === "number") {
            return status === rule;
        }
        if (typeof rule !== "string") {
            return false;
        }
        if (rule.includes("-")) {
            const [min, max] = rule.split("-").map((v) => Number.parseInt(v, 10));
            if (Number.isNaN(min) || Number.isNaN(max)) {
                return false;
            }
            return status >= min && status <= max;
        }
        const value = Number.parseInt(rule, 10);
        return !Number.isNaN(value) && status === value;
    });
}

async function checkHttp(assignment) {
    const { config } = assignment;
    const timeoutMs = config.timeout ? config.timeout * 1000 : 10000;
    const headers = config.headers ? safeJsonParse(config.headers, {}) : {};
    const method = config.method || "GET";
    const body = config.body || undefined;
    const acceptedStatuscodes = normalizeAcceptedStatuscodes(config.accepted_statuscodes || config.accepted_statuscodes_json);

    const httpsAgent = new https.Agent({ rejectUnauthorized: !config.ignoreTls });
    const httpAgent = new http.Agent();

    const start = dayjs().valueOf();
    const response = await axios.request({
        url: config.url,
        method,
        headers,
        data: body,
        timeout: timeoutMs,
        httpAgent,
        httpsAgent,
        validateStatus: () => true,
    });
    const latencyMs = dayjs().valueOf() - start;

    if (!isStatusCodeAccepted(response.status, acceptedStatuscodes)) {
        return {
            status: DOWN,
            msg: `Unexpected status code ${response.status}`,
            latencyMs,
            body: response.data,
        };
    }

    return {
        status: UP,
        msg: "OK",
        latencyMs,
        body: response.data,
    };
}

async function checkKeyword(assignment) {
    const { config } = assignment;
    const response = await checkHttp(assignment);
    if (response.status !== UP) {
        return response;
    }
    const body = response.body ?? "";
    const keyword = config.keyword || "";
    const invert = Boolean(config.invertKeyword);
    const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
    const hasKeyword = bodyStr.includes(keyword);

    if ((hasKeyword && !invert) || (!hasKeyword && invert)) {
        return {
            status: UP,
            msg: "Keyword matched",
            latencyMs: response.latencyMs,
        };
    }

    return {
        status: DOWN,
        msg: "Keyword not found",
        latencyMs: response.latencyMs,
    };
}

async function checkJsonQuery(assignment) {
    const { config } = assignment;
    const response = await checkHttp(assignment);
    if (response.status !== UP) {
        return response;
    }
    const body = response.body ?? "";
    const jsonPath = config.jsonPath || "";
    const jsonPathOperator = config.jsonPathOperator || "==";
    const expectedValue = config.expectedValue ?? "";
    const { status } = await evaluateJsonQuery(body, jsonPath, jsonPathOperator, expectedValue);

    if (status) {
        return {
            status: UP,
            msg: "JSON query matched",
            latencyMs: response.latencyMs,
        };
    }

    return {
        status: DOWN,
        msg: "JSON query failed",
        latencyMs: response.latencyMs,
    };
}

async function checkPing(assignment) {
    const { config } = assignment;
    const count = config.ping_count ?? 1;
    const numeric = config.ping_numeric !== undefined ? config.ping_numeric : true;
    const size = config.packetSize ?? 56;
    const timeout = config.ping_per_request_timeout ?? 2;
    const start = dayjs().valueOf();
    const result = await ping.promise.probe(config.hostname, {
        v6: false,
        min_reply: count,
        numeric,
        packetSize: size,
        deadline: timeout,
        timeout,
    });
    const latencyMs = dayjs().valueOf() - start;

    if (!result.alive) {
        throw new Error(result.output || "Ping failed");
    }

    return {
        status: UP,
        msg: "",
        latencyMs: Number.parseFloat(result.time),
    };
}

function checkTcp(assignment) {
    const { config } = assignment;
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const socket = new net.Socket();
        const timeoutMs = config.timeout ? config.timeout * 1000 : 10000;

        const onError = (error) => {
            socket.destroy();
            reject(error);
        };

        socket.setTimeout(timeoutMs, () => {
            onError(new Error("TCP timeout"));
        });

        socket.once("error", onError);

        socket.connect(config.port, config.hostname, () => {
            const latencyMs = Date.now() - start;
            socket.end();
            resolve({
                status: UP,
                msg: "",
                latencyMs,
            });
        });
    });
}

async function checkDns(assignment) {
    const { config } = assignment;
    const resolver = new Resolver();
    const type = config.dns_resolve_type || "A";
    const servers = config.dns_resolve_server
        ? config.dns_resolve_server.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (servers.length) {
        resolver.setServers(servers);
    }

    const start = Date.now();
    let records;
    switch (type) {
        case "AAAA":
            records = await resolver.resolve6(config.hostname);
            break;
        case "CAA":
            records = await resolver.resolveCaa(config.hostname);
            break;
        case "CNAME":
            records = await resolver.resolveCname(config.hostname);
            break;
        case "MX":
            records = await resolver.resolveMx(config.hostname);
            break;
        case "NS":
            records = await resolver.resolveNs(config.hostname);
            break;
        case "PTR":
            records = await resolver.resolvePtr(config.hostname);
            break;
        case "SOA":
            records = await resolver.resolveSoa(config.hostname);
            break;
        case "SRV":
            records = await resolver.resolveSrv(config.hostname);
            break;
        case "TXT":
            records = await resolver.resolveTxt(config.hostname);
            break;
        case "A":
        default:
            records = await resolver.resolve4(config.hostname);
            break;
    }
    const latencyMs = Date.now() - start;

    return {
        status: UP,
        msg: Array.isArray(records) ? `Records: ${records.join(" | ")}` : "OK",
        latencyMs,
    };
}

function safeJsonParse(value, fallback) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

async function executeAssignment(assignment) {
    switch (assignment.type) {
        case "http":
            return await checkHttp(assignment);
        case "keyword":
            return await checkKeyword(assignment);
        case "json-query":
            return await checkJsonQuery(assignment);
        case "ping":
            return await checkPing(assignment);
        case "port":
            return await checkTcp(assignment);
        case "dns":
            return await checkDns(assignment);
        default:
            return {
                status: DOWN,
                msg: `Unsupported monitor type: ${assignment.type}`,
            };
    }
}

module.exports = {
    executeAssignment,
};
