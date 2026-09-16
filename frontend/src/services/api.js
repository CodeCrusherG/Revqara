import axios from 'axios';

const getApiUrl = () => {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    if (hostname.includes('orb.local')) {
        const backendHostname = hostname.replace('frontend', 'backend');
        return `${protocol}//${backendHostname}`;
    }
    return `${protocol}//${hostname}:8000`;
};

const API_URL = getApiUrl();
const api = axios.create({ baseURL: API_URL });

const TOKEN_KEY = 'cx_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

// Attach the JWT to every request.
api.interceptors.request.use((config) => {
    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

// On 401, drop the token and bounce to login (except on auth calls themselves).
api.interceptors.response.use(
    (r) => r,
    (error) => {
        const url = error?.config?.url || '';
        if (error?.response?.status === 401 && !url.includes('/auth/')) {
            setToken(null);
            if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/signup')) {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    signup: (payload) => api.post('/api/auth/signup', payload).then((r) => r.data),
    login: (payload) => api.post('/api/auth/login', payload).then((r) => r.data),
    me: () => api.get('/api/auth/me').then((r) => r.data),
};

export const contactsApi = {
    list: (q = '', limit = 100, offset = 0) =>
        api.get(`/api/contacts`, { params: { q, limit, offset } }).then((r) => r.data),
    create: (payload) => api.post('/api/contacts', payload).then((r) => r.data),
    update: (id, payload) => api.patch(`/api/contacts/${id}`, payload).then((r) => r.data),
    remove: (id) => api.delete(`/api/contacts/${id}`).then((r) => r.data),
    importCsv: (file) => {
        const form = new FormData();
        form.append('file', file);
        return api.post('/api/contacts/import', form, { headers: { 'Content-Type': 'multipart/form-data' } }).then((r) => r.data);
    },
    seedDemo: (count = 100) => api.post(`/api/contacts/seed-demo`, null, { params: { count } }).then((r) => r.data),
    optOut: (id) => api.post(`/api/contacts/${id}/opt-out`).then((r) => r.data),
    optIn: (id) => api.post(`/api/contacts/${id}/opt-in`).then((r) => r.data),
    setTags: (id, tags) => api.post(`/api/contacts/${id}/tags`, { tags }).then((r) => r.data),
};

export const leadsApi = {
    list: (params = {}) => api.get('/api/leads', { params }).then((r) => r.data),
    create: (payload) => api.post('/api/leads', payload).then((r) => r.data),
    setStatus: (id, status) => api.patch(`/api/leads/${id}`, { status }).then((r) => r.data),
    assign: (id, { user_id = null, team_id = null }) =>
        api.patch(`/api/leads/${id}/assign`, { user_id, team_id }).then((r) => r.data),
    unassign: (id) => api.patch(`/api/leads/${id}/unassign`).then((r) => r.data),
    assignedToMe: () => api.get('/api/me/assigned-leads').then((r) => r.data),
};

export const workspacesApi = {
    list: () => api.get('/api/workspaces').then((r) => r.data),
    create: (payload) => api.post('/api/workspaces', payload).then((r) => r.data),
    current: () => api.get('/api/workspaces/current').then((r) => r.data),
    update: (id, payload) => api.put(`/api/workspaces/${id}`, payload).then((r) => r.data),
    switch: (id) => api.post(`/api/workspaces/${id}/switch`).then((r) => r.data),
};

export const teamApi = {
    members: () => api.get('/api/team/members').then((r) => r.data),
    invites: () => api.get('/api/team/invites').then((r) => r.data),
    invite: (payload) => api.post('/api/team/invites', payload).then((r) => r.data),
    acceptInvite: (token) => api.post(`/api/team/invites/${token}/accept`).then((r) => r.data),
    updateMember: (id, payload) => api.patch(`/api/team/members/${id}`, payload).then((r) => r.data),
    removeMember: (id) => api.delete(`/api/team/members/${id}`).then((r) => r.data),
};

export const salesTeamsApi = {
    list: () => api.get('/api/sales-teams').then((r) => r.data),
    create: (payload) => api.post('/api/sales-teams', payload).then((r) => r.data),
    update: (id, payload) => api.patch(`/api/sales-teams/${id}`, payload).then((r) => r.data),
    remove: (id) => api.delete(`/api/sales-teams/${id}`).then((r) => r.data),
    addMember: (id, userId) => api.post(`/api/sales-teams/${id}/members`, { user_id: userId }).then((r) => r.data),
    removeMember: (id, userId) => api.delete(`/api/sales-teams/${id}/members/${userId}`).then((r) => r.data),
};

export const templatesApi = {
    list: () => api.get('/api/templates').then((r) => r.data),
    create: (payload) => api.post('/api/templates', payload).then((r) => r.data),
    submit: (id) => api.post(`/api/templates/${id}/submit`).then((r) => r.data),
    remove: (id) => api.delete(`/api/templates/${id}`).then((r) => r.data),
    testSend: (payload) => api.post('/api/campaigns/test-send', payload).then((r) => r.data),
};

export const listsApi = {
    list: () => api.get('/api/lists').then((r) => r.data),
    create: (payload) => api.post('/api/lists', payload).then((r) => r.data),
    remove: (id) => api.delete(`/api/lists/${id}`).then((r) => r.data),
    members: (id) => api.get(`/api/lists/${id}/contacts`).then((r) => r.data),
    addMembers: (id, contactIds) => api.post(`/api/lists/${id}/members`, { contact_ids: contactIds }).then((r) => r.data),
    removeMember: (id, contactId) => api.delete(`/api/lists/${id}/members/${contactId}`).then((r) => r.data),
};

export const billingApi = {
    plans: () => api.get('/api/billing/plans').then((r) => r.data),
    usage: () => api.get('/api/billing/usage').then((r) => r.data),
    checkout: (plan) => api.post('/api/billing/checkout', { plan }).then((r) => r.data),
    cancel: () => api.post('/api/billing/cancel').then((r) => r.data),
};

export const whatsappApi = {
    listAccounts: () => api.get('/api/whatsapp/accounts').then((r) => r.data),
    connect: (payload = {}) => api.post('/api/whatsapp/accounts/connect', payload).then((r) => r.data),
    disconnect: (id) => api.delete(`/api/whatsapp/accounts/${id}`).then((r) => r.data),
};

export const inboxApi = {
    conversations: (params = {}) => api.get('/api/inbox/conversations', { params }).then((r) => r.data),
    thread: (id) => api.get(`/api/inbox/conversations/${id}`).then((r) => r.data),
    assign: (id, { user_id = null, team_id = null }) =>
        api.post(`/api/inbox/conversations/${id}/assign`, { user_id, team_id }).then((r) => r.data),
    reply: (id, text) => api.post(`/api/inbox/conversations/${id}/reply`, { text }).then((r) => r.data),
    setAutoReply: (id, enabled) => api.post(`/api/inbox/conversations/${id}/auto-reply`, { enabled }).then((r) => r.data),
    getBot: () => api.get('/api/inbox/bot').then((r) => r.data),
    updateBot: (payload) => api.put('/api/inbox/bot', payload).then((r) => r.data),
    simulate: (text, name) => api.post('/api/inbox/simulate', { text, name }).then((r) => r.data),
    stats: () => api.get('/api/inbox/stats').then((r) => r.data),
};

export const verticalsApi = {
    get: () => api.get('/api/verticals').then((r) => r.data),
    set: (vertical) => api.put('/api/verticals', { vertical }).then((r) => r.data),
};

export const campaignApi = {
    listCampaigns: async (limit = 50) => (await api.get(`/api/campaigns?limit=${limit}`)).data,
    generateCampaign: async (payload) => {
        const body = typeof payload === 'string' ? { brief: payload } : payload;
        return (await api.post('/api/campaigns/generate', body)).data;
    },
    getCampaignStatus: async (id) => (await api.get(`/api/campaigns/${id}/status`)).data,
    getCampaignStatusSummary: async (id) => (await api.get(`/api/campaigns/${id}/status-summary`)).data,
    approveCampaign: async (id) => (await api.post(`/api/campaigns/${id}/approve`)).data,
    rejectCampaign: async (id, feedback) => (await api.post(`/api/campaigns/${id}/reject`, { feedback })).data,
    getMetrics: async (id) => (await api.get(`/api/campaigns/${id}/metrics`)).data,
    getAnalytics: async (id) => (await api.get(`/api/campaigns/${id}/analytics`)).data,
    getQuota: async () => (await api.get('/api/billing/usage')).data,
    triggerOptimize: async (id) => (await api.post(`/api/campaigns/${id}/optimize`)).data,
    getSystemStatus: async () => (await api.get('/health')).data,
};
