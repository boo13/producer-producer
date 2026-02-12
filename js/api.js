/**
 * API Client for Producer-Producer
 * Handles authentication, token management, and API communication
 */

// NOTE: `api.producer-producer.com` is currently behind a Cloudflare challenge,
// which can block browser fetch() in some environments.
const DEFAULT_LOCAL_API_BASE_URLS = [
    'http://localhost:8080',
    'http://127.0.0.1:8080',
    'http://localhost:8000',
    'http://127.0.0.1:8000',
];
const DEFAULT_PRODUCTION_API_BASE_URLS = [
    'https://producer-producer-api.fly.dev',
    'https://api.producer-producer.com',
];
const REQUEST_TIMEOUT_MS = 12000;
const HEALTHCHECK_TIMEOUT_MS = 2500;

const TOKEN_KEY = 'pp_auth_token';
const USER_KEY = 'pp_user_data';

function normalizeBaseUrl(value) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.replace(/\/+$/, '');
}

function parseConfiguredApiBaseUrls(rawValue) {
    if (!rawValue) return [];

    if (Array.isArray(rawValue)) {
        return rawValue.map(normalizeBaseUrl).filter(Boolean);
    }

    if (typeof rawValue === 'string') {
        return rawValue
            .split(',')
            .map(normalizeBaseUrl)
            .filter(Boolean);
    }

    return [];
}

function unique(values) {
    return [...new Set(values)];
}

function getRuntimeConfiguredBaseUrls() {
    const config = window.__PP_CONFIG__ || {};
    const metaTagValue = document.querySelector('meta[name="pp-api-base-url"]')?.content;

    return parseConfiguredApiBaseUrls(
        config.apiBaseUrls || config.apiBaseUrl || window.PP_API_BASE_URLS || window.PP_API_BASE_URL || metaTagValue
    );
}

function getQueryParamConfiguredBaseUrls() {
    const apiParam = new URLSearchParams(window.location.search).get('api');
    if (!apiParam) return [];

    if (apiParam === 'local') {
        return [...DEFAULT_LOCAL_API_BASE_URLS];
    }

    if (apiParam === 'prod' || apiParam === 'production') {
        return [...DEFAULT_PRODUCTION_API_BASE_URLS];
    }

    return parseConfiguredApiBaseUrls(apiParam);
}

function getApiBaseUrls() {
    const queryConfigured = getQueryParamConfiguredBaseUrls();
    if (queryConfigured.length > 0) {
        return unique(queryConfigured);
    }

    // Default to production endpoints even during local frontend dev.
    // Append local fallbacks for convenience if production is unreachable.
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const runtimeConfigured = getRuntimeConfiguredBaseUrls();
    const localFallbacks = isLocalHost ? DEFAULT_LOCAL_API_BASE_URLS : [];
    return unique([...runtimeConfigured, ...DEFAULT_PRODUCTION_API_BASE_URLS, ...localFallbacks]);
}

function isNetworkError(error) {
    if (!error) return false;

    const name = String(error.name || '');
    const message = String(error.message || '');

    if (name === 'TypeError' || name === 'AbortError') {
        return true;
    }

    return /fetch|network|load failed|failed to fetch/i.test(message);
}

function withRequestTimeout(timeoutMs, upstreamSignal) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    if (upstreamSignal) {
        if (upstreamSignal.aborted) {
            controller.abort();
        } else {
            upstreamSignal.addEventListener('abort', () => controller.abort(), { once: true });
        }
    }

    return {
        signal: controller.signal,
        cleanup: () => clearTimeout(timeoutId),
    };
}

class APIClient {
    constructor() {
        this.baseUrls = getApiBaseUrls();
        this.baseUrl = this.baseUrls[0];
        this.baseUrlResolved = false;
        this.token = localStorage.getItem(TOKEN_KEY);
        this.user = this.loadUser();
    }

    /**
     * Load user data from localStorage
     */
    loadUser() {
        const userData = localStorage.getItem(USER_KEY);
        if (!userData) return null;
        try {
            return JSON.parse(userData);
        } catch (err) {
            console.error('Failed to parse user data:', err);
            return null;
        }
    }

    /**
     * Save user data to localStorage
     */
    saveUser(user) {
        this.user = user;
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        return !!this.token && !!this.user;
    }

    /**
     * Get current user
     */
    getCurrentUser() {
        return this.user;
    }

    /**
     * Provide API connection diagnostics for UI error reporting.
     */
    getNetworkDiagnostics() {
        return {
            activeBaseUrl: this.baseUrl,
            candidateBaseUrls: [...this.baseUrls],
            baseUrlResolved: this.baseUrlResolved,
        };
    }

    /**
     * Set authentication token
     */
    setToken(token) {
        this.token = token;
        localStorage.setItem(TOKEN_KEY, token);
    }

    /**
     * Clear authentication
     */
    logout() {
        this.token = null;
        this.user = null;
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    /**
     * Select a reachable API host when multiple candidates are configured.
     */
    async resolveBaseUrl() {
        if (this.baseUrlResolved || this.baseUrls.length <= 1) {
            this.baseUrlResolved = true;
            return;
        }

        for (const candidate of this.baseUrls) {
            const { signal, cleanup } = withRequestTimeout(HEALTHCHECK_TIMEOUT_MS);
            try {
                const response = await fetch(`${candidate}/health`, {
                    method: 'GET',
                    signal,
                });

                if (response.ok) {
                    this.baseUrl = candidate;
                    this.baseUrlResolved = true;
                    return;
                }
            } catch (_) {
                // Try the next candidate host.
            } finally {
                cleanup();
            }
        }

        this.baseUrlResolved = true;
    }

    /**
     * Parse response body safely for both JSON and non-JSON responses.
     */
    async parseResponseBody(response) {
        if (response.status === 204) {
            return null;
        }

        const contentType = response.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json');

        if (isJson) {
            try {
                return await response.json();
            } catch (_) {
                return null;
            }
        }

        const text = await response.text();
        return text || null;
    }

    /**
     * Build a user-safe, actionable API error message for non-2xx responses.
     */
    buildHttpErrorMessage(response, body) {
        if (body && typeof body === 'object' && typeof body.detail === 'string') {
            return body.detail;
        }

        if (typeof body === 'string' && body.trim()) {
            return body.trim();
        }

        return `HTTP ${response.status}: ${response.statusText}`;
    }

    /**
     * Make HTTP request with error handling
     */
    async request(endpoint, options = {}) {
        await this.resolveBaseUrl();

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Add auth token if available
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        const config = {
            ...options,
            headers,
        };

        const { signal, cleanup } = withRequestTimeout(REQUEST_TIMEOUT_MS, config.signal);
        config.signal = signal;

        try {
            const response = await fetch(url, config);

            // Handle 401 Unauthorized
            if (response.status === 401) {
                this.logout();
                throw new Error('Authentication required. Please log in again.');
            }

            const data = await this.parseResponseBody(response);

            if (!response.ok) {
                throw new Error(this.buildHttpErrorMessage(response, data));
            }

            return data;
        } catch (err) {
            if (isNetworkError(err)) {
                throw new Error(
                    `Network error while contacting ${this.baseUrl}. Verify API domain, CORS, and connectivity.`
                );
            }
            throw err;
        } finally {
            cleanup();
        }
    }

    /**
     * Auth: Request magic link
     */
    async requestMagicLink(email) {
        return await this.request('/auth/magic-link', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    }

    /**
     * Auth: Verify magic link token
     */
    async verifyMagicLink(token) {
        const data = await this.request(`/auth/verify?token=${token}`, {
            method: 'GET',
        });

        // Store token and user data
        this.setToken(data.access_token);
        this.saveUser(data.user);

        return data;
    }

    /**
     * Auth: Get current user info
     */
    async getMe() {
        const data = await this.request('/auth/me', {
            method: 'GET',
        });
        this.saveUser(data);
        return data;
    }

    /**
     * Users: Get user profile
     */
    async getUserProfile() {
        return await this.request('/users/me', {
            method: 'GET',
        });
    }

    /**
     * Users: Update user profile
     */
    async updateUserProfile(updates) {
        return await this.request('/users/me', {
            method: 'PUT',
            body: JSON.stringify(updates),
        });
    }

    /**
     * Users: Get user configuration
     */
    async getUserConfig() {
        return await this.request('/users/me/config', {
            method: 'GET',
        });
    }

    /**
     * Users: Update user configuration
     */
    async updateUserConfig(config) {
        return await this.request('/users/me/config', {
            method: 'PUT',
            body: JSON.stringify(config),
        });
    }

    /**
     * Opportunities: Get public ranked feed (no auth required)
     */
    async getOpportunityFeed(params = {}) {
        const queryParams = new URLSearchParams();

        if (params.min_score !== undefined && params.min_score !== null) {
            queryParams.append('min_score', params.min_score);
        }
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.offset) queryParams.append('offset', params.offset);
        if (params.company_id) queryParams.append('company_id', params.company_id);

        const queryString = queryParams.toString();
        const endpoint = `/opportunities/feed${queryString ? '?' + queryString : ''}`;

        return await this.request(endpoint, {
            method: 'GET',
        });
    }

    /**
     * Opportunities: Get personalized opportunities
     */
    async getOpportunitiesForMe(params = {}) {
        const queryParams = new URLSearchParams();

        if (params.status) queryParams.append('status', params.status);
        if (params.min_score !== undefined) queryParams.append('min_score', params.min_score);
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.offset) queryParams.append('offset', params.offset);

        const queryString = queryParams.toString();
        const endpoint = `/opportunities/for-me${queryString ? '?' + queryString : ''}`;

        return await this.request(endpoint, {
            method: 'GET',
        });
    }

    /**
     * Opportunities: Get user's opportunities with status
     */
    async getUserOpportunities(params = {}) {
        const queryParams = new URLSearchParams();

        if (params.status_filter) {
            queryParams.append('status_filter', params.status_filter);
        } else if (params.status) {
            queryParams.append('status_filter', params.status);
        }
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.offset) queryParams.append('offset', params.offset);

        const queryString = queryParams.toString();
        const endpoint = `/users/me/opportunities${queryString ? '?' + queryString : ''}`;

        return await this.request(endpoint, {
            method: 'GET',
        });
    }

    /**
     * Opportunities: Update opportunity status
     */
    async updateOpportunityStatus(opportunityId, status, options = {}) {
        const body = { status };
        if (options.score !== undefined && options.score !== null) {
            body.score = options.score;
        }
        if (options.ignore_reason !== undefined) {
            body.ignore_reason = options.ignore_reason;
        }

        return await this.request(`/users/me/opportunities/${opportunityId}`, {
            method: 'PUT',
            body: JSON.stringify(body),
        });
    }

    /**
     * Opportunities: Get single opportunity
     */
    async getOpportunity(id) {
        return await this.request(`/opportunities/${id}`, {
            method: 'GET',
        });
    }

    /**
     * Opportunities: Evaluate opportunity for current user
     */
    async evaluateOpportunity(id) {
        return await this.request(`/opportunities/${id}/evaluate`, {
            method: 'POST',
        });
    }

    /**
     * Health check
     */
    async healthCheck() {
        return await this.request('/health', {
            method: 'GET',
        });
    }
}

// Create singleton instance
const api = new APIClient();

// Export for use in other scripts
window.api = api;
