import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [config, setConfig] = useState(null);
  useEffect(() => {
    api.get('/config').then(setConfig).catch(() => {});
    api.get('/me').then((r) => setUser(r.user)).catch(() => setUser(null));
  }, []);
  const login = useCallback(async (email, password) => setUser((await api.post('/auth/login', { email, password })).user), []);
  const register = useCallback(async (name, email, password) => setUser((await api.post('/auth/register', { name, email, password })).user), []);
  const otpRequest = useCallback((channel, identifier) => api.post('/auth/otp/request', { channel, identifier }), []);
  const otpVerify = useCallback(async (channel, identifier, code, name) => { const r = await api.post('/auth/otp/verify', { channel, identifier, code, name }); setUser(r.user); return r; }, []);
  const logout = useCallback(async () => { await api.post('/auth/logout').catch(() => {}); setUser(null); }, []);
  const updateProfile = useCallback(async (patch) => setUser((await api.patch('/me', patch)).user), []);
  return <Ctx.Provider value={{ user, config, login, register, otpRequest, otpVerify, logout, updateProfile }}>{children}</Ctx.Provider>;
}
