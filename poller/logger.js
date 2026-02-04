function createLogger(scope) {
    return {
        info(message) {
            log("INFO", scope, message);
        },
        warn(message) {
            log("WARN", scope, message);
        },
        error(message) {
            log("ERROR", scope, message);
        },
        debug(message) {
            log("DEBUG", scope, message);
        },
    };
}

function log(level, scope, message) {
    const timestamp = new Date().toISOString();
    console.log(`${timestamp} [${scope}] ${level}: ${message}`);
}

module.exports = {
    createLogger,
};
