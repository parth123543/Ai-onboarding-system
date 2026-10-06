"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { User, Session, AuthError } from "@supabase/supabase-js";
import { supabase, UserProfile, isSupabaseConfigured } from "../lib/supabase";
import { api } from "../lib/api";

interface SignUpMetadata {
  full_name: string;
  phone?: string;
  role: string;
  work_location: string;
  department?: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  token: string;
  loading: boolean;
  isConfigured: boolean;
  signUpWithEmail: (email: string, password: string, metadata: SignUpMetadata) => Promise<{ user: User | null; session: Session | null; needsEmailConfirmation: boolean }>;
  signInWithEmail: (email: string, password: string) => Promise<{ user: User | null; session: Session | null }>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  signInWithPhone: (phone: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, token: string) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updateUserPassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const isConfigured = isSupabaseConfigured();

  // Helper to fetch or create user profile from Supabase Database
  const fetchOrCreateProfile = useCallback(async (currentUser: User, metadata?: SignUpMetadata): Promise<UserProfile | null> => {
    if (!isConfigured) return null;

    try {
      // 1. Attempt to fetch profile from public.profiles table
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", currentUser.id)
        .maybeSingle();

      if (data && !error) {
        setProfile(data as UserProfile);
        return data as UserProfile;
      }

      // 2. If profile record does not exist yet (e.g. OAuth signup or trigger pending), create it
      const meta = currentUser.user_metadata || {};
      const newProfile: UserProfile = {
        id: currentUser.id,
        full_name: metadata?.full_name || meta.full_name || meta.name || currentUser.email?.split("@")[0] || "New Joiner",
        email: currentUser.email || "",
        phone: metadata?.phone || meta.phone || meta.phone_number || currentUser.phone || null,
        role: metadata?.role || meta.role || "Software Engineer",
        work_location: metadata?.work_location || meta.work_location || meta.location || "Redmond, WA",
        department: metadata?.department || meta.department || "Engineering",
        is_admin: Boolean(meta.is_admin),
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .upsert(newProfile, { onConflict: "id" })
        .select()
        .single();

      if (!insertError && inserted) {
        setProfile(inserted as UserProfile);
        return inserted as UserProfile;
      }

      // Fallback to local profile state if RLS or network prevented insert
      setProfile(newProfile);
      return newProfile;
    } catch (err) {
      console.warn("Error fetching/creating Supabase profile:", err);
      return null;
    }
  }, [isConfigured]);

  // Initialize session and listen to Supabase Auth state changes
  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      if (!isConfigured) {
        if (mounted) setLoading(false);
        return;
      }

      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        if (error) {
          console.error("Error retrieving Supabase session:", error);
        }

        if (mounted) {
          if (initialSession) {
            setSession(initialSession);
            setUser(initialSession.user);
            setToken(initialSession.access_token);
            await fetchOrCreateProfile(initialSession.user);
          } else {
            setSession(null);
            setUser(null);
            setToken("");
            setProfile(null);
          }
        }
      } catch (err) {
        console.error("Auth initialization failed:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    initAuth();

    // Subscribe to auth state updates
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      if (currentSession?.user) {
        setSession(currentSession);
        setUser(currentSession.user);
        setToken(currentSession.access_token);
        await fetchOrCreateProfile(currentSession.user);
      } else {
        setSession(null);
        setUser(null);
        setToken("");
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isConfigured, fetchOrCreateProfile]);

  // Sign up with Email + Password and save profile metadata
  const signUpWithEmail = async (email: string, password: string, metadata: SignUpMetadata) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: {
          full_name: metadata.full_name,
          phone: metadata.phone || null,
          role: metadata.role,
          work_location: metadata.work_location,
          department: metadata.department || "Engineering",
        },
        emailRedirectTo: typeof window !== "undefined" ? `${window.location.origin}/auth/callback` : undefined,
      },
    });

    if (error) throw error;

    if (data.user) {
      // Upsert profile record directly into database
      await fetchOrCreateProfile(data.user, metadata);
    }

    // Check if email confirmation is required (session is null if email confirmation is turned on in Supabase)
    const needsEmailConfirmation = !data.session;

    return {
      user: data.user,
      session: data.session,
      needsEmailConfirmation,
    };
  };

  // Sign in with Email + Password
  const signInWithEmail = async (email: string, password: string) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) throw error;

    if (data.user) {
      await fetchOrCreateProfile(data.user);
    }

    return { user: data.user, session: data.session };
  };

  // Google OAuth
  const signInWithGoogle = async () => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) throw error;
  };

  // Microsoft / Azure OAuth
  const signInWithMicrosoft = async () => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email openid profile User.Read",
        redirectTo: `${origin}/auth/callback`,
      },
    });

    if (error) throw error;
  };

  // Phone SMS OTP Request
  const signInWithPhone = async (phone: string) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const { error } = await supabase.auth.signInWithOtp({
      phone: phone.trim(),
    });

    if (error) throw error;
  };

  // Phone SMS OTP Verification
  const verifyPhoneOtp = async (phone: string, token: string) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const { data, error } = await supabase.auth.verifyOtp({
      phone: phone.trim(),
      token: token.trim(),
      type: "sms",
    });

    if (error) throw error;

    if (data.user) {
      await fetchOrCreateProfile(data.user);
    }
  };

  // Forgot password / Reset password via email
  const resetPasswordForEmail = async (email: string) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${origin}/reset-password`,
    });

    if (error) throw error;
  };

  // Update password for authenticated user (e.g. after password reset redirect)
  const updateUserPassword = async (password: string) => {
    if (!isConfigured) {
      throw new Error("Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  };

  // Sign out
  const signOut = async () => {
    if (!isConfigured) {
      setUser(null);
      setSession(null);
      setProfile(null);
      setToken("");
      return;
    }

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.warn("Sign out error:", error);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    setToken("");
  };

  // Refresh profile manually
  const refreshProfile = async (): Promise<UserProfile | null> => {
    if (!user) return null;
    return await fetchOrCreateProfile(user);
  };

  // Update profile fields
  const updateProfile = async (updates: Partial<UserProfile>): Promise<UserProfile | null> => {
    if (!user || !isConfigured) return null;

    const { data, error } = await supabase
      .from("profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single();

    if (error) throw error;

    if (data) {
      setProfile(data as UserProfile);
      return data as UserProfile;
    }
    return null;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        token,
        loading,
        isConfigured,
        signUpWithEmail,
        signInWithEmail,
        signInWithGoogle,
        signInWithMicrosoft,
        signInWithPhone,
        verifyPhoneOtp,
        resetPasswordForEmail,
        updateUserPassword,
        signOut,
        refreshProfile,
        updateProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
