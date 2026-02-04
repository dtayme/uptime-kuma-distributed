const { describe, test } = require("node:test");
const assert = require("node:assert");
const { GenericContainer, Wait } = require("testcontainers");
const mysql = require("mysql2");
const { MysqlMonitorType } = require("../../../server/monitor-types/mysql");
const { UP, PENDING } = require("../../../src/util");

const MYSQL_READY_TIMEOUT_MS = 60000;
const MYSQL_READY_RETRY_DELAY_MS = 1000;
const MYSQL_READY_CONNECT_TIMEOUT_MS = 5000;

/**
 * Wait until the MariaDB server accepts a connection or the timeout elapses.
 * @returns {Promise<void>} Resolves when the server is ready.
 */
async function waitForMariaDbReady(connectionString) {
    const deadline = Date.now() + MYSQL_READY_TIMEOUT_MS;
    let lastError = null;

    while (Date.now() < deadline) {
        try {
            await new Promise((resolve, reject) => {
                const connection = mysql.createConnection({
                    uri: connectionString,
                    connectTimeout: MYSQL_READY_CONNECT_TIMEOUT_MS,
                });

                connection.query("SELECT 1", (err) => {
                    try {
                        connection.end();
                    } catch (_) {
                        void _;
                        connection.destroy();
                    }

                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve();
                });
            });

            return;
        } catch (error) {
            lastError = error;
            await new Promise((resolve) => setTimeout(resolve, MYSQL_READY_RETRY_DELAY_MS));
        }
    }

    const message = lastError ? `${lastError.message}` : "MariaDB did not become ready in time";
    throw new Error(message);
}

/**
 * Helper function to create and start a MariaDB container
 * @returns {Promise<{container: import("testcontainers").StartedTestContainer, connectionString: string}>} The started container and connection string
 */
async function createAndStartMariaDBContainer() {
    const database = "test";
    const username = "test";
    const password = "test";
    const port = 3306;
    const container = await new GenericContainer("mariadb:10.11")
        .withEnvironment({
            MARIADB_DATABASE: database,
            MARIADB_USER: username,
            MARIADB_PASSWORD: password,
            MARIADB_ROOT_PASSWORD: password,
        })
        .withExposedPorts(port)
        .withWaitStrategy(Wait.forLogMessage(/port: 3306/))
        .withStartupTimeout(120000)
        .start();

    const connectionString = `mysql://${username}:${password}@${container.getHost()}:${container.getMappedPort(port)}/${database}`;
    await waitForMariaDbReady(connectionString);

    return {
        container,
        connectionString,
    };
}

describe(
    "MySQL/MariaDB Monitor",
    {
        skip: !!process.env.CI && (process.platform !== "linux" || process.arch !== "x64"),
    },
    () => {
        test("check() sets status to UP when MariaDB server is reachable", async () => {
            const { container, connectionString } = await createAndStartMariaDBContainer();

            const mysqlMonitor = new MysqlMonitorType();
            const monitor = {
                databaseConnectionString: connectionString,
                conditions: "[]",
            };

            const heartbeat = {
                msg: "",
                status: PENDING,
            };

            try {
                await mysqlMonitor.check(monitor, heartbeat, {});
                assert.strictEqual(heartbeat.status, UP, `Expected status ${UP} but got ${heartbeat.status}`);
            } finally {
                await container.stop();
            }
        });

        test("check() rejects when MariaDB server is not reachable", async () => {
            const mysqlMonitor = new MysqlMonitorType();
            const monitor = {
                databaseConnectionString: "mysql://invalid:invalid@localhost:13306/test",
                conditions: "[]",
            };

            const heartbeat = {
                msg: "",
                status: PENDING,
            };

            await assert.rejects(mysqlMonitor.check(monitor, heartbeat, {}), (err) => {
                assert.ok(
                    err.message.includes("Database connection/query failed"),
                    `Expected error message to include "Database connection/query failed" but got: ${err.message}`
                );
                return true;
            });
            assert.notStrictEqual(heartbeat.status, UP, `Expected status should not be ${UP}`);
        });

        test("check() sets status to UP when custom query result meets condition", async () => {
            const { container, connectionString } = await createAndStartMariaDBContainer();

            const mysqlMonitor = new MysqlMonitorType();
            const monitor = {
                databaseConnectionString: connectionString,
                databaseQuery: "SELECT 42 AS value",
                conditions: JSON.stringify([
                    {
                        type: "expression",
                        andOr: "and",
                        variable: "result",
                        operator: "equals",
                        value: "42",
                    },
                ]),
            };

            const heartbeat = {
                msg: "",
                status: PENDING,
            };

            try {
                await mysqlMonitor.check(monitor, heartbeat, {});
                assert.strictEqual(heartbeat.status, UP, `Expected status ${UP} but got ${heartbeat.status}`);
            } finally {
                await container.stop();
            }
        });

        test("check() rejects when custom query result does not meet condition", async () => {
            const { container, connectionString } = await createAndStartMariaDBContainer();

            const mysqlMonitor = new MysqlMonitorType();
            const monitor = {
                databaseConnectionString: connectionString,
                databaseQuery: "SELECT 99 AS value",
                conditions: JSON.stringify([
                    {
                        type: "expression",
                        andOr: "and",
                        variable: "result",
                        operator: "equals",
                        value: "42",
                    },
                ]),
            };

            const heartbeat = {
                msg: "",
                status: PENDING,
            };

            try {
                await assert.rejects(
                    mysqlMonitor.check(monitor, heartbeat, {}),
                    new Error("Query result did not meet the specified conditions (99)")
                );
                assert.strictEqual(heartbeat.status, PENDING, `Expected status should not be ${heartbeat.status}`);
            } finally {
                await container.stop();
            }
        });
    }
);
