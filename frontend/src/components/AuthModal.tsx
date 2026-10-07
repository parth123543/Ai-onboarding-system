"use client";

import React, { useState } from "react";
import {
  X,
  Mail,
  Lock,
  User as UserIcon,
  Phone,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { User, api } from "../lib/api";

interface AuthModalProps {
  isOpen?: boolean;
  onClose: () => void;
  onSuccess: (user: User, token: string) => void;
}

export default function AuthModal({ isOpen = true, onClose, onSuccess }: AuthModalProps) {
  const auth = useAuth();

  const [tab, setTab] = useState<"login" | "signup" | "phone">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Email / Password State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [role, setRole] = useState("Software Engineer");
  const [department, setDepartment] = useState("Engineering");
  const [location, setLocation] = useState("Redmond, WA");

  // Forgot Password sub-view
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  // Phone OTP State
  const [otpPhone, setOtpPhone] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  if (isOpen === false) return null;

  // Helper: Convert Supabase user → API User shape
  const toApiUser = (supaUser: any, profileOverrides?: Record<string, any>): User => {
    const meta = supaUser.user_metadata || {};
    return {
      id: supaUser.id,
      email: supaUser.email || "",
      full_name: profileOverrides?.full_name || meta.full_name || meta.name || supaUser.email?.split("@")[0] || "New Joiner",
      role: profileOverrides?.role || meta.role || "Software Engineer",
      department: profileOverrides?.department || meta.department || "Engineering",
      location: profileOverrides?.location || meta.work_location || meta.location || "Redmond, WA",
      is_admin: Boolean(meta.is_admin),
      created_at: supaUser.created_at || new Date().toISOString(),
    };
  };

  // ─── Email Login ─────────────────────────────────────────────────────────
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      const backendRes = await api.login({ email: email.trim().toLowerCase(), password });
      if (backendRes.access_token) {
        if (typeof window !== "undefined") {
          localStorage.setItem("launchmate_auth_token", backendRes.access_token);
          localStorage.setItem("launchmate_user_id", backendRes.user.id);
        }
        onSuccess(backendRes.user, backendRes.access_token);
        onClose();
        return;
      }
    } catch (backendErr: any) {
      console.warn("Direct backend login attempt:", backendErr?.message);
    }
    try {
      const { user, session } = await auth.signInWithEmail(email, password);
      if (user && session) {
        onSuccess(toApiUser(user), session.access_token);
        onClose();
      } else {
        setError("Sign-in succeeded but no session was returned. Please try again.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Email Sign Up ───────────────────────────────────────────────────────
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      // 1. Register in backend database immediately (generates personalized checklist & JWT)
      let backendRes: any = null;
      try {
        backendRes = await api.signup({
          email: email.trim().toLowerCase(),
          password,
          full_name: fullName,
          role,
          department,
          location,
          phone_number: phoneNumber || undefined,
          is_admin: false,
        });
      } catch (beErr: any) {
        // If email already exists in backend, tell user to login
        if (beErr?.message?.includes("already exists")) {
          setError("An account with this email already exists. Please switch to the Sign In tab.");
          setLoading(false);
          return;
        }
        console.warn("Backend signup call:", beErr);
      }

      // 2. Also register in Supabase Auth
      try {
        await auth.signUpWithEmail(email, password, {
          full_name: fullName,
          phone: phoneNumber || undefined,
          role,
          work_location: location,
          department,
        });
      } catch (supaErr: any) {
        console.warn("Supabase signup note:", supaErr);
      }

      // 3. If backend created the account successfully, log them in immediately!
      if (backendRes?.access_token) {
        if (typeof window !== "undefined") {
          localStorage.setItem("launchmate_auth_token", backendRes.access_token);
          localStorage.setItem("launchmate_user_id", backendRes.user.id);
        }
        onSuccess(backendRes.user, backendRes.access_token);
        onClose();
        return;
      }

      setSuccessMessage("🎉 Account created! You can now sign in with your credentials.");
      setTab("login");
    } catch (err: any) {
      setError(err.message || "Registration failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  // ─── OAuth Login ─────────────────────────────────────────────────────────
  const handleOAuthLogin = async (provider: "google" | "microsoft") => {
    setError(null);
    setLoading(true);
    try {
      if (provider === "google") await auth.signInWithGoogle();
      else await auth.signInWithMicrosoft();
    } catch (err: any) {
      setError(err.message || `${provider} sign-in failed.`);
      setLoading(false);
    }
  };

  // ─── Forgot Password ─────────────────────────────────────────────────────
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);
    try {
      await auth.resetPasswordForEmail(forgotEmail || email);
      setSuccessMessage("📧 Reset link sent! Check your inbox.");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  };

  // ─── Phone OTP ────────────────────────────────────────────────────────────
  const handleSendPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpPhone) return;
    setError(null);
    setLoading(true);
    try {
      await auth.signInWithPhone(otpPhone);
      setOtpSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send OTP.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyPhoneOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.verifyPhoneOtp(otpPhone, otpCode);
      setTimeout(() => {
        if (auth.user && auth.session) {
          onSuccess(toApiUser(auth.user), auth.session.access_token);
          onClose();
        }
      }, 500);
    } catch (err: any) {
      setError(err.message || "Invalid verification code.");
    } finally {
      setLoading(false);
    }
  };

  /* ─────────────────────────────────────────────────────────────────────────
     Shared input className
  ───────────────────────────────────────────────────────────────────────── */
  const inputCls = "w-full glass-input rounded-xl px-3 py-2.5 text-sm placeholder-white/35 text-white outline-none transition-all";
  const labelCls = "block text-[11px] font-semibold text-white/50 uppercase tracking-widest mb-1.5";

  return (
    /* ── Full-screen overlay with animated blobs ── */
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden">
      {/* Dark scrim */}
      <div className="absolute inset-0 bg-[#080810]/80 backdrop-blur-sm animate-fadeIn" onClick={onClose} />

      {/* ── Animated chrome blobs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Blob 1 — top-right */}
        <div
          className="animate-blob-1 absolute -top-24 -right-16 w-[480px] h-[480px] rounded-full opacity-90"
          style={{
            background: "radial-gradient(circle at 40% 40%, #e8e8f0 0%, #b0b4c8 25%, #7880a0 50%, #3a3f60 75%, transparent 100%)",
            filter: "blur(2px)",
          }}
        />
        {/* Blob 2 — bottom-left */}
        <div
          className="animate-blob-2 absolute -bottom-32 -left-20 w-[420px] h-[420px] rounded-full opacity-80"
          style={{
            background: "radial-gradient(circle at 60% 60%, #d8dce8 0%, #9098b4 25%, #5860880 50%, #2a3050 75%, transparent 100%)",
            filter: "blur(3px)",
          }}
        />
        {/* Blob 3 — center-left accent */}
        <div
          className="animate-blob-3 absolute top-1/2 -left-32 w-[300px] h-[300px] rounded-full opacity-60"
          style={{
            background: "radial-gradient(circle at 50% 50%, #c8cce0 0%, #8088a8 40%, transparent 100%)",
            filter: "blur(4px)",
          }}
        />
        {/* Purple ambient glow */}
        <div
          className="animate-orb absolute top-1/4 right-1/4 w-[200px] h-[200px] rounded-full opacity-20"
          style={{ background: "radial-gradient(circle, #8b5cf6, transparent 70%)", filter: "blur(40px)" }}
        />
        <div
          className="animate-orb absolute bottom-1/4 left-1/3 w-[160px] h-[160px] rounded-full opacity-15"
          style={{ background: "radial-gradient(circle, #6366f1, transparent 70%)", filter: "blur(30px)", animationDelay: "-6s" }}
        />
      </div>

      {/* ── Glass Modal Card ── */}
      <div
        className="relative z-10 w-full max-w-md mx-4 animate-fadeInUp"
        style={{ animationDelay: "0.05s" }}
      >
        {/* Shine border wrapper */}
        <div className="shine-border rounded-3xl p-px">
          <div
            className="glass-card rounded-3xl p-6 sm:p-8 relative overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ scrollbarWidth: "thin" }}
          >
            {/* Inner glow highlight */}
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />

            {/* Close Button */}
            <button
              onClick={onClose}
              className="absolute top-5 right-5 text-white/40 hover:text-white/80 p-1.5 rounded-full hover:bg-white/10 transition-all"
            >
              <X className="w-5 h-5" />
            </button>

            {/* ── Logo + Header ── */}
            <div className="text-center mb-7">
              {/* Logo */}
              <div className="flex justify-center mb-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white/10 border border-white/20 shadow-lg animate-glow">
                  {/* Custom circular logo */}
                  <img src="/logo.png" alt="Launch Mate" className="w-9 h-9 object-contain" />
                </div>
              </div>
              <h1 className="text-2xl font-black tracking-tight gradient-text mb-1">Launch Mate</h1>
              <p className="text-xs text-white/40 font-medium tracking-widest uppercase">Employee Onboarding Portal</p>
            </div>

            {/* ── Tabs (Sign In / Join) ── */}
            {!showForgotPassword && (
              <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/10 mb-6">
                {([["login", "Sign In"], ["signup", "Join"], ["phone", "Phone"]] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTab(key); setError(null); setSuccessMessage(null); }}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                      tab === key
                        ? "bg-white/15 text-white shadow-inner border border-white/20"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Error / Success Alerts ── */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-400/20 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/20 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* ────── Forgot Password ────── */}
            {showForgotPassword ? (
              <div className="space-y-4">
                <p className="text-xs text-white/50 mb-4">Enter your email and we&apos;ll send a reset link.</p>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div>
                    <label className={labelCls}>Email Address</label>
                    <div className="relative">
                      <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="email"
                        required
                        value={forgotEmail || email}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@launchmate.com"
                        className={`${inputCls} pl-9`}
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/20 text-white text-sm font-bold transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {loading ? "Sending..." : "Send Reset Link"}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => { setShowForgotPassword(false); setError(null); setSuccessMessage(null); }}
                  className="w-full text-center text-xs text-white/40 hover:text-white/70 font-semibold transition-colors"
                >
                  ← Back to Sign In
                </button>
              </div>
            ) : (
              <>
                {/* ── OAuth Buttons ── */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <button
                    type="button"
                    onClick={() => handleOAuthLogin("google")}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-white/80 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                    Google
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOAuthLogin("microsoft")}
                    disabled={loading}
                    className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/8 hover:bg-white/14 border border-white/12 text-white/80 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-40"
                  >
                    <div className="grid grid-cols-2 gap-0.5 w-4 h-4">
                      <span className="bg-[#f25022] rounded-sm" />
                      <span className="bg-[#7fba00] rounded-sm" />
                      <span className="bg-[#00a4ef] rounded-sm" />
                      <span className="bg-[#ffb900] rounded-sm" />
                    </div>
                    Microsoft
                  </button>
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3 mb-5">
                  <div className="flex-1 h-px bg-white/10" />
                  <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">or</span>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* ── Sign In Tab ── */}
                {tab === "login" && (
                  <form onSubmit={handleEmailLogin} className="space-y-4">
                    <div>
                      <label className={labelCls}>Email</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@launchmate.com"
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Password</label>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? "text" : "password"}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          className={`${inputCls} pl-9 pr-10`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => { setShowForgotPassword(true); setForgotEmail(email); setError(null); }}
                        className="text-[11px] text-white/40 hover:text-white/70 font-semibold transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-indigo-600/80 hover:bg-indigo-500/90 border border-indigo-400/30 text-white font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                            <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                          Authenticating...
                        </span>
                      ) : (
                        <>Sign In to Dashboard <ArrowRight className="w-4 h-4" /></>
                      )}
                    </button>
                  </form>
                )}

                {/* ── Join / Sign Up Tab ── */}
                {tab === "signup" && (
                  <form onSubmit={handleSignup} className="space-y-3">
                    <div>
                      <label className={labelCls}>Full Name</label>
                      <div className="relative">
                        <UserIcon className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="e.g., Sarah Chen"
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </div>

                    <div>
                      <label className={labelCls}>Corporate Email</label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@launchmate.com"
                          className={`${inputCls} pl-9`}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>Password</label>
                        <div className="relative">
                          <Lock className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            className={`${inputCls} pl-9`}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>Phone (optional)</label>
                        <div className="relative">
                          <Phone className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                          <input
                            type="tel"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            placeholder="+1 425 555 0199"
                            className={`${inputCls} pl-9`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Role-Based Settings */}
                    <div className="p-3 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 space-y-3">
                      <span className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest block">
                        🎯 Role-Based Checklist
                      </span>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={labelCls}>Role</label>
                          <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            className="w-full glass-input rounded-xl px-2.5 py-2 text-xs outline-none"
                          >
                            <option value="Software Engineer">Software Engineer</option>
                            <option value="Product Manager">Product Manager</option>
                            <option value="Data Scientist">Data Scientist</option>
                            <option value="HR Specialist">HR Specialist</option>
                            <option value="Solutions Architect">Solutions Architect</option>
                          </select>
                        </div>
                        <div>
                          <label className={labelCls}>Location</label>
                          <select
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            className="w-full glass-input rounded-xl px-2.5 py-2 text-xs outline-none"
                          >
                            <option value="Redmond, WA">Redmond, WA (HQ)</option>
                            <option value="London, UK">London, UK</option>
                            <option value="Bangalore, India">Bangalore, India</option>
                            <option value="Seattle, WA">Seattle, WA</option>
                            <option value="Remote">Remote</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-indigo-600/80 hover:bg-indigo-500/90 border border-indigo-400/30 text-white font-bold text-sm shadow-lg transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {loading ? "Generating Your Checklist..." : <>Complete Registration <ArrowRight className="w-4 h-4" /></>}
                    </button>
                  </form>
                )}

                {/* ── Phone Tab ── */}
                {tab === "phone" && (
                  <div className="space-y-4">
                    {!otpSent ? (
                      <form onSubmit={handleSendPhoneOtp} className="space-y-4">
                        <div>
                          <label className={labelCls}>Phone Number</label>
                          <div className="relative">
                            <Phone className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                              type="tel"
                              required
                              value={otpPhone}
                              onChange={(e) => setOtpPhone(e.target.value)}
                              placeholder="+1 (425) 555-0188"
                              className={`${inputCls} pl-9`}
                            />
                          </div>
                          <p className="text-[11px] text-white/30 mt-1.5">We&apos;ll send a 6-digit verification code.</p>
                        </div>
                        <button
                          type="submit"
                          disabled={loading || !otpPhone}
                          className="w-full py-3 rounded-xl bg-indigo-600/80 hover:bg-indigo-500/90 border border-indigo-400/30 text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {loading ? "Sending..." : <>Send SMS Code <ArrowRight className="w-4 h-4" /></>}
                        </button>
                      </form>
                    ) : (
                      <form onSubmit={handleVerifyPhoneOtp} className="space-y-4">
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-400/20 text-emerald-300 text-xs">
                          Code sent to <strong>{otpPhone}</strong>. Enter the 6-digit code.
                        </div>
                        <div>
                          <label className={labelCls}>6-Digit Code</label>
                          <input
                            type="text"
                            required
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="123456"
                            className={`${inputCls} text-center tracking-widest text-lg font-mono`}
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading || otpCode.length < 6}
                          className="w-full py-3 rounded-xl bg-emerald-600/80 hover:bg-emerald-500/90 border border-emerald-400/30 text-white font-bold text-sm transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                          {loading ? "Verifying..." : <>Verify &amp; Open Dashboard <CheckCircle2 className="w-4 h-4" /></>}
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Footer */}
            <p className="text-center text-[10px] text-white/25 mt-6 font-medium tracking-wide">
              Launch Mate · Microsoft Innovate 2026 · PS15
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
