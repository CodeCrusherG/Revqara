import React, { createContext, useContext, useEffect, useState } from 'react';
import { authApi, workspacesApi, getToken, setToken } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [workspace, setWorkspace] = useState(null);
    const [loading, setLoading] = useState(true);

    const apply = (data) => {
        if (data.access_token) setToken(data.access_token);
        setUser(data.user);
        setWorkspace(data.workspace);
    };

    useEffect(() => {
        if (!getToken()) {
            setLoading(false);
            return;
        }
        authApi
            .me()
            .then((d) => {
                setUser(d.user);
                setWorkspace(d.workspace);
            })
            .catch(() => setToken(null))
            .finally(() => setLoading(false));
    }, []);

    const login = async (payload) => apply(await authApi.login(payload));
    const signup = async (payload) => apply(await authApi.signup(payload));
    const logout = () => {
        setToken(null);
        setUser(null);
        setWorkspace(null);
        window.location.href = '/login';
    };
    const refreshWorkspace = (ws) => setWorkspace(ws);

    // Switch the active workspace: get a token scoped to it, then reload so every
    // page re-fetches workspace-scoped data cleanly.
    const switchWorkspace = async (workspaceId) => {
        const res = await workspacesApi.switch(workspaceId);
        if (res.access_token) setToken(res.access_token);
        window.location.href = '/';
    };

    // The caller's role in the active workspace (from /auth/me payload).
    const role = workspace?.role || user?.role || null;

    return (
        <AuthContext.Provider
            value={{
                user, workspace, role, loading, login, signup, logout,
                refreshWorkspace, switchWorkspace, isAuthed: !!user,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
