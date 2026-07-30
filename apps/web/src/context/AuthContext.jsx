import { useState, useEffect } from "react";
import api from "../services/api";
import { AuthContext } from "./authStore";

export function AuthProvider({ children }) {
  const initialToken = localStorage.getItem("token");
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(() => Boolean(initialToken));

  useEffect(() => {
    if (!token) return undefined;

    const controller = new AbortController();

    api
      .get("/api/users/me", { signal: controller.signal })
      .then((res) => setUser(res.data))
      .catch((error) => {
        if (error.code === "ERR_CANCELED") return;
        localStorage.removeItem("token");
        setToken(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [token]);

  const login = async (username, password) => {
    const formData = new URLSearchParams();
    formData.append("username", username);
    formData.append("password", password);
    const res = await api.post("/api/users/login", formData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const newToken = res.data.access_token;
    localStorage.setItem("token", newToken);
    setToken(newToken);
    const userRes = await api.get("/api/users/me", {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    setUser(userRes.data);
  };

  const register = async (email, username, password) => {
    await api.post("/api/users/register", { email, username, password });
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
