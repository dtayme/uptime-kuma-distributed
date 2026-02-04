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

        <div v-if="pollers.length === 0" class="text-muted">
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
                        <th>Last Heartbeat</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="poller in pollers" :key="poller.id">
                        <td>{{ poller.name }}</td>
                        <td>{{ poller.region }}</td>
                        <td>{{ poller.datacenter || "-" }}</td>
                        <td>{{ poller.status }}</td>
                        <td>{{ poller.queueDepth }}</td>
                        <td>{{ poller.version || "-" }}</td>
                        <td>{{ poller.lastHeartbeatAt || "-" }}</td>
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
        };
    },
    computed: {
        pollers() {
            return this.$root.pollerList || [];
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
    },
};
</script>
