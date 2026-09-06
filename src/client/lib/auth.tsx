import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api";

export type Me = {
  id: string;
  email: string;
  name: string | null;
  brandName: string | null;
  brandColor: string | null;
  brandLogoKey: string | null;
  defaultStyle: string | null;
  notifyEmails: string[];
  paymentUrl: string | null;
  hideMadeWith: boolean;
  marketingOptIn: boolean;
  isAdmin: boolean;
  caps: { liveLimit: number; seats: number; pdf: boolean; brand: boolean; protect: boolean; notify: boolean; payment: boolean; countersign: boolean; footerOff: boolean };
  plan: string; // what the account can do right now (a trial reads as "pro")
  paidPlan: string;
  trial: boolean;
  trialDaysLeft: number;
  workspace: { ownerName: string } | null; // set when working inside someone else's Business team
  pendingInvite: { id: string; ownerName: string } | null;
};

type AuthState = { user: Me | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = async () => {
    try {
      const r = await api<{ user: Me | null }>("/auth/me");
      setUser(r.user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  };
  useEffect(() => {
    void refresh();
  }, []);
  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
