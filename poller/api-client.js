class PollerApiClient {
    constructor({ baseUrl, accessToken, pollerId }) {
        this.baseUrl = baseUrl.replace(/\/+$/, "");
        this.accessToken = accessToken;
        this.pollerId = pollerId;
    }

    async heartbeat(payload) {
        return this.request("/api/poller/heartbeat", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async fetchAssignments(sinceVersion) {
        const url = new URL(`${this.baseUrl}/api/poller/assignments`);
        if (sinceVersion !== undefined && sinceVersion !== null) {
            url.searchParams.set("since_version", sinceVersion);
        }
        if (this.pollerId) {
            url.searchParams.set("poller_id", this.pollerId);
        }

        return this.request(url.toString(), { method: "GET" }, true);
    }

    async postResults(results) {
        return this.request("/api/poller/results", {
            method: "POST",
            body: JSON.stringify({ results }),
        });
    }

    async request(pathOrUrl, options, isAbsolute) {
        const url = isAbsolute ? pathOrUrl : `${this.baseUrl}${pathOrUrl}`;
        const headers = {
            "content-type": "application/json",
        };

        if (this.accessToken) {
            headers.authorization = `Bearer ${this.accessToken}`;
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                ...headers,
                ...(options.headers || {}),
            },
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(`Poller API request failed (${response.status}): ${text}`);
        }

        if (response.status === 204) {
            return null;
        }

        return response.json().catch(() => null);
    }
}

module.exports = {
    PollerApiClient,
};
