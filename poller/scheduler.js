class Scheduler {
    constructor(logger) {
        this.logger = logger;
        this.assignments = [];
        this.started = false;
    }

    updateAssignments(assignments) {
        this.assignments = Array.isArray(assignments) ? assignments : [];
        if (this.logger) {
            this.logger.info(`Loaded ${this.assignments.length} assignments`);
        }
    }

    start(intervalMs) {
        if (this.started) {
            return;
        }
        this.started = true;
        setInterval(() => this.tick(), intervalMs);
    }

    tick() {
        // Placeholder for future execution loop.
        // A real implementation will schedule monitor checks and enqueue results.
        return;
    }
}

module.exports = {
    Scheduler,
};
