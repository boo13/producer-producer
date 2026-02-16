/**
 * API Client for Producer-Producer
 * Handles authentication, token management, and API communication
 */

// NOTE: `api.producer-producer.com` is currently behind a Cloudflare challenge,
// which blocks browser fetch() from local dev servers.
// Using the Fly.io origin directly for now.
const PROD_API_BASE_URL = 'https://producer-producer-api.fly.dev';
const LOCAL_API_BASE_URL = 'http://localhost:8000';

// Default to production even during local frontend dev.
// To use a local API, run the site with `?api=local`.
const apiParam = new URLSearchParams(window.location.search).get('api');
const API_BASE_URL = apiParam === 'local' ? LOCAL_API_BASE_URL : PROD_API_BASE_URL;

const TOKEN_KEY = 'pp_auth_token';
const USER_KEY = 'pp_user_data';

class APIClient {
    constructor() {
        this.baseUrl = API_BASE_URL;
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
     * Make HTTP request with error handling
     */
    async request(endpoint, options = {}) {
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

        try {
            const response = await fetch(url, config);

            // Handle 401 Unauthorized (only when a token was sent)
            if (response.status === 401 && this.token) {
                this.logout();
                throw new Error('Authentication required. Please log in again.');
            }

            // Parse JSON response
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || `HTTP ${response.status}: ${response.statusText}`);
            }

            return data;
        } catch (err) {
            if (err.message.includes('fetch')) {
                throw new Error('Network error. Please check your connection.');
            }
            throw err;
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
     * Auth: Verify OTP code
     */
    async verifyOtpCode(email, code) {
        const data = await this.request('/auth/verify-code', {
            method: 'POST',
            body: JSON.stringify({ email, code }),
        });
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
     * Opportunities: Bulk reorder saved jobs
     * @param {Array<{opportunity_id: number, display_order: number}>} items - Array of items to reorder
     */
    async reorderOpportunities(items) {
        return await this.request('/users/me/opportunities/reorder', {
            method: 'PUT',
            body: JSON.stringify(items),
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
     * Opportunities: Create a new opportunity (user-submitted job)
     * @param {Object} data - Opportunity data
     * @param {string} data.title - Job title (required)
     * @param {string} data.company_name - Company name (required)
     * @param {string} data.url - Job URL (required)
     * @param {string} [data.location] - Location (optional)
     * @param {string} [data.notes] - Notes/description (optional)
     */
    async addOpportunity(data) {
        const payload = {
            external_id: data.external_id || `user-${Date.now()}`,
            source: 'user-submitted',
            source_company: 'user',
            title: data.title,
            company_name: data.company_name,
            url: data.url,
        };

        // Add optional fields if provided
        if (data.location) {
            payload.location_raw = data.location;
        }
        if (data.notes) {
            payload.description = data.notes;
        }

        return await this.request('/opportunities', {
            method: 'POST',
            body: JSON.stringify(payload),
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
