// Automated npm audit + Snyk scan and report generator.
// Usage: node extra/auto-code-audit.mjs

import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";

const OUTPUT_PATH = path.resolve("docs/auto_code_audit.md");

const isMain = typeof import.meta.main === "boolean"
    ? import.meta.main
    : fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");

if (isMain) {
    await main();
}

/**
 * Main entry point.
 * @returns {Promise<void>}
 */
async function main() {
    const startedAt = new Date();
    const nodeVersion = process.version;
    const npmVersion = getCommandOutput("npm", ["--version"]).trim();

    const npmAudit = runCommand("npm", ["audit", "--json"]);
    const npmAuditJson = parseJson(npmAudit.stdout);
    const npmSummary = summarizeNpmAudit(npmAuditJson);

    const snykToken = process.env.SNYK_TOKEN ?? "";
    let snyk = null;
    let snykJson = null;
    let snykSummary = null;

    if (snykToken) {
        snyk = runCommand("npx", ["--yes", "snyk@latest", "test", "--json"], {
            env: {
                ...process.env,
                SNYK_TOKEN: snykToken,
            },
        });
        snykJson = parseJson(snyk.stdout);
        snykSummary = summarizeSnyk(snykJson);
    }

    const report = buildReport({
        startedAt,
        nodeVersion,
        npmVersion,
        npmAudit,
        npmAuditJson,
        npmSummary,
        snyk,
        snykJson,
        snykSummary,
    });

    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, report);
    console.log(`Wrote report: ${OUTPUT_PATH}`);
}

/**
 * Run a command and capture output.
 * @param {string} command Command
 * @param {string[]} args Args
 * @param {{env?: NodeJS.ProcessEnv}} options Options
 * @returns {{status: number | null, stdout: string, stderr: string}}
 */
function runCommand(command, args, options = {}) {
    const resolved = resolveCommand(command);
    const result = spawnSync(resolved, args, {
        encoding: "utf8",
        env: options.env ?? process.env,
    });

    return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
    };
}

/**
 * Resolve command name for Windows.
 * @param {string} command Command
 * @returns {string}
 */
function resolveCommand(command) {
    if (process.platform === "win32" && !command.endsWith(".cmd")) {
        return `${command}.cmd`;
    }

    return command;
}

/**
 * Get command output (stdout).
 * @param {string} command Command
 * @param {string[]} args Args
 * @returns {string}
 */
function getCommandOutput(command, args) {
    const result = runCommand(command, args);
    if (result.status !== 0) {
        return "";
    }

    return result.stdout;
}

/**
 * Parse JSON safely.
 * @param {string} raw Raw text
 * @returns {object|null}
 */
function parseJson(raw) {
    if (!raw) {
        return null;
    }

    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
        return null;
    }

    try {
        return JSON.parse(raw.slice(start, end + 1));
    } catch {
        return null;
    }
}

/**
 * Summarize npm audit JSON.
 * @param {object|null} json Audit JSON
 * @returns {{info: number, low: number, moderate: number, high: number, critical: number}|null}
 */
function summarizeNpmAudit(json) {
    if (!json || !json.metadata || !json.metadata.vulnerabilities) {
        return null;
    }

    const vuln = json.metadata.vulnerabilities;
    return {
        info: vuln.info ?? 0,
        low: vuln.low ?? 0,
        moderate: vuln.moderate ?? 0,
        high: vuln.high ?? 0,
        critical: vuln.critical ?? 0,
    };
}

/**
 * Summarize Snyk JSON.
 * @param {object|null} json Snyk JSON
 * @returns {{critical: number, high: number, medium: number, low: number}|null}
 */
function summarizeSnyk(json) {
    if (!json || !Array.isArray(json.vulnerabilities)) {
        return null;
    }

    const counts = {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0,
    };

    for (const vuln of json.vulnerabilities) {
        const severity = (vuln.severity ?? "").toLowerCase();
        if (severity in counts) {
            counts[severity] += 1;
        }
    }

    return counts;
}

/**
 * Build the Markdown report.
 * @param {object} data Report data
 * @returns {string}
 */
function buildReport(data) {
    const lines = [];

    lines.push("# Automated Code Audit");
    lines.push("");
    lines.push(`Date: ${data.startedAt.toISOString()}`);
    lines.push(`Host: ${os.hostname()}`);
    lines.push(`Node: ${data.nodeVersion}`);
    lines.push(`npm: ${data.npmVersion || "unknown"}`);
    lines.push("");

    lines.push("## npm audit");
    lines.push(`- Exit code: ${formatExitCode(data.npmAudit.status)}`);
    if (data.npmSummary) {
        lines.push(`- Summary: info ${data.npmSummary.info}, low ${data.npmSummary.low}, moderate ${data.npmSummary.moderate}, high ${data.npmSummary.high}, critical ${data.npmSummary.critical}`);
    } else {
        lines.push("- Summary: unavailable (failed to parse JSON)");
    }
    lines.push("");
    lines.push("<details>");
    lines.push("<summary>Raw npm audit JSON</summary>");
    lines.push("");
    lines.push("```json");
    lines.push(data.npmAudit.stdout.trim() || "{}");
    lines.push("```");
    lines.push("</details>");
    lines.push("");

    lines.push("## Snyk");
    if (!data.snyk) {
        lines.push("- Status: skipped (SNYK_TOKEN not set)");
    } else {
        lines.push(`- Exit code: ${formatExitCode(data.snyk.status)}`);
        if (data.snykSummary) {
            lines.push(`- Summary: low ${data.snykSummary.low}, medium ${data.snykSummary.medium}, high ${data.snykSummary.high}, critical ${data.snykSummary.critical}`);
        } else {
            lines.push("- Summary: unavailable (failed to parse JSON)");
        }
        lines.push("");
        lines.push("<details>");
        lines.push("<summary>Raw Snyk JSON</summary>");
        lines.push("");
        lines.push("```json");
        lines.push(data.snyk.stdout.trim() || "{}");
        lines.push("```");
        lines.push("</details>");
    }

    lines.push("");
    return lines.join("\n");
}

/**
 * Format exit code for reporting.
 * @param {number|null} code Exit code
 * @returns {string}
 */
function formatExitCode(code) {
    if (code === null || typeof code === "undefined") {
        return "unknown";
    }

    return String(code);
}
