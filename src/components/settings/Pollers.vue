<template>
    <div>
        <h4 class="mb-3">Remote Pollers</h4>

        <div class="mb-4">
            <label class="form-label">Registration Token</label>
            <div class="d-flex flex-wrap gap-2 align-items-center">
                <div class="flex-grow-1">
                    <CopyableInput v-model="registrationToken" :disabled="true" />
                </div>
                <button class="btn btn-primary" type="button" @click="generateToken" :disabled="processing">
                    Generate / Rotate
                </button>
                <button class="btn btn-secondary" type="button" @click="refresh">
                    Refresh
                </button>
            </div>
            <div class="form-text mt-2">
                Provide this token in the <code>X-Poller-Registration-Token</code> header when calling
                <code>POST /api/poller/register</code>.
            </div>
        </div>

        <div v-if="rotatedToken" class="alert alert-success">
            New poller token for <strong>{{ rotatedPollerName }}</strong>:
            <CopyableInput v-model="rotatedToken" :disabled="true" class="mt-2" />
        </div>

        <div class="d-flex justify-content-between align-items-center mb-2">
            <h5 class="mb-0">Registered Pollers</h5>
        </div>

        <div class="row g-2 align-items-end mb-3">
            <div class="col-md-4">
                <label class="form-label">Search</label>
                <input v-model="searchText" class="form-control" type="text" placeholder="Name or region" />
            </div>
            <div class="col-md-3">
                <label class="form-label">Status</label>
                <select v-model="statusFilter" class="form-select">
                    <option value="">All</option>
                    <option value="online">Online</option>
                    <option value="degraded">Degraded</option>
                    <option value="offline">Offline</option>
                </select>
            </div>
            <div class="col-md-3">
                <label class="form-label">Region</label>
                <select v-model="regionFilter" class="form-select">
                    <option value="">All</option>
                    <option v-for="region in regions" :key="region" :value="region">
                        {{ region }}
                    </option>
                </select>
            </div>
            <div class="col-md-2">
                <button class="btn btn-outline-secondary w-100" type="button" @click="clearFilters">
                    Clear
                </button>
            </div>
        </div>

        <div v-if="filteredPollers.length === 0" class="text-muted">
            No pollers registered.
        </div>

        <div v-else class="table-responsive">
            <table class="table table-striped">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Region</th>
                        <th>Datacenter</th>
                        <th>Status</th>
                        <th>Queue</th>
                        <th>Version</th>
                        <th>Capabilities</th>
                        <th>Last Heartbeat</th>
                        <th>Last Results</th>
                        <th>Assignment Version</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="poller in filteredPollers" :key="poller.id">
                        <td>{{ poller.name }}</td>
                        <td>{{ poller.region }}</td>
                        <td>{{ poller.datacenter || "-" }}</td>
                        <td>{{ poller.status }}</td>
                        <td>{{ poller.queueDepth }}</td>
                        <td>{{ poller.version || "-" }}</td>
                        <td>{{ formatCapabilities(poller.capabilities) }}</td>
                        <td>{{ poller.lastHeartbeatAt || "-" }}</td>
                        <td>{{ poller.lastResultsAt || "-" }}</td>
                        <td>{{ poller.assignmentVersion ?? "-" }}</td>
                        <td class="d-flex gap-2">
                            <button class="btn btn-outline-primary btn-sm" @click="rotateToken(poller)">
                                Rotate Token
                            </button>
                            <button class="btn btn-outline-danger btn-sm" @click="revokeTokens(poller)">
                                Revoke Tokens
                            </button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script>
import CopyableInput from "../CopyableInput.vue";

export default {
    components: {
        CopyableInput,
    },
    data() {
        return {
            registrationToken: "",
            rotatedToken: "",
            rotatedPollerName: "",
            processing: false,
            searchText: "",
            statusFilter: "",
            regionFilter: "",
        };
    },
    computed: {
        pollers() {
            return this.$root.pollerList || [];
        },
        filteredPollers() {
            return this.pollers.filter((poller) => {
                if (this.statusFilter && poller.status !== this.statusFilter) {
                    return false;
                }
                if (this.regionFilter && poller.region !== this.regionFilter) {
                    return false;
                }
                if (this.searchText) {
                    const term = this.searchText.toLowerCase();
                    const combined = `${poller.name} ${poller.region} ${poller.datacenter || ""}`.toLowerCase();
                    if (!combined.includes(term)) {
                        return false;
                    }
                }
                return true;
            });
        },
        regions() {
            const unique = new Set(this.pollers.map((poller) => poller.region).filter(Boolean));
            return Array.from(unique).sort();
        },
    },
    mounted() {
        this.refresh();
        this.loadToken();
    },
    methods: {
        refresh() {
            this.$root.getPollerList(() => {});
        },
        loadToken() {
            this.$root.getPollerRegistrationToken((res) => {
                if (res.ok) {
                    this.registrationToken = res.token || "";
                }
            });
        },
        generateToken() {
            this.processing = true;
            this.$root.generatePollerRegistrationToken((res) => {
                this.processing = false;
                if (res.ok) {
                    this.registrationToken = res.token || "";
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },
        rotateToken(poller) {
            this.$root.rotatePollerToken(poller.id, (res) => {
                if (res.ok) {
                    this.rotatedToken = res.token;
                    this.rotatedPollerName = poller.name;
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },
        revokeTokens(poller) {
            this.$root.revokePollerTokens(poller.id, (res) => {
                if (res.ok) {
                    this.$root.toastSuccess("Tokens revoked");
                } else {
                    this.$root.toastError(res.msg);
                }
            });
        },
        clearFilters() {
            this.searchText = "";
            this.statusFilter = "";
            this.regionFilter = "";
        },
        formatCapabilities(capabilities) {
            if (!capabilities || typeof capabilities !== "object") {
                return "-";
            }
            const enabled = Object.entries(capabilities)
                .filter(([, value]) => Boolean(value))
                .map(([key]) => key);
            return enabled.length ? enabled.join(", ") : "-";
        },
    },
};
</script>
