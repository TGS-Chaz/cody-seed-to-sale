import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

export interface UserProfile {
  id: string;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone: string | null;
  role: string | null;
  company: string | null;
  avatar_url: string | null;
  tier?: string | null;
  booking_username?: string | null;
}

interface ProfileContextValue {
  profile: UserProfile | null;
  loading: boolean;
  refresh: () => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user) { setProfile(null); setLoading(false); return; }
    setLoading(true);
    supabase.from("profiles").select("*").eq("id", user.id).single()
      .then(({ data }) => { setProfile(data ?? null); setLoading(false); });
  }, [user?.id, tick]);

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh: () => setTick(t => t + 1) }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used inside ProfileProvider");
  return ctx;
}

/** First name from profile.full_name, or capitalised email local part */
export function profileDisplayName(profile: UserProfile | null, email?: string | null): string {
  if (profile?.full_name?.trim()) {
    return profile.full_name.trim().split(/\s+/)[0];
  }
  if (email) {
    const local = email.split("@")[0];
    return local.charAt(0).toUpperCase() + local.slice(1).toLowerCase();
  }
  return "User";
}

/** 1-2 letter initials from name or email */
export function profileInitials(profile: UserProfile | null, email?: string | null): string {
  if (profile?.full_name?.trim()) {
    const parts = profile.full_name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0].toUpperCase();
  }
  if (email) return email[0].toUpperCase();
  return "U";
}
