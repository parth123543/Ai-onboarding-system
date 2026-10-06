"use client";

import React, { useState, useEffect } from "react";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Shield,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Calendar,
  Building,
  MapPin,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  ExternalLink,
  Laptop,
  HeartHandshake,
  UserPlus,
  LogIn,
  LogOut,
  PhoneCall,
  Users,
  ShieldAlert,
  HelpCircle,
  Bell,
  X,
  Send,
  LifeBuoy,
  Briefcase,
  BookOpen,
  PlayCircle
} from "lucide-react";
import { api, User, Task, TaskStats } from "../lib/api";
import ChatWidget from "../components/ChatWidget";
import AdminPortal from "../components/AdminPortal";
import AuthModal from "../components/AuthModal";
import CallAgentModal from "../components/CallAgentModal";
import KanbanBoard from "../components/KanbanBoard";
import ChatRoom from "../components/ChatRoom";

import { useAuth } from "../context/AuthContext";

export default function DashboardPage() {
  const auth = useAuth();

  // ─── Core State ──────────────────────────────────────────────────────
  const [demoUsers, setDemoUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [showApp, setShowApp] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Navigation & Feature Tabs
  const [mainTab, setMainTab] = useState<"onboarding" | "jira" | "chat">("onboarding");
  
  // Day / Milestone Filter state
  const [dayFilter, setDayFilter] = useState<string>("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  
  // Modals state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showCallModal, setShowCallModal] = useState(false);
  const [callTopic, setCallTopic] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  // Issue Reporting Modal State
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueReason, setIssueReason] = useState("IT Equipment / Hardware");
  const [issueSummary, setIssueSummary] = useState("");
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [issueSuccessMsg, setIssueSuccessMsg] = useState<string | null>(null);

  // Proactive reminder banner dismissed
  const [dismissReminder, setDismissReminder] = useState(false);

  // ─── Initialise app: load demo users & auto‑login ───────────────────
  useEffect(() => {
    if (!auth.loading) {
      initApp();
    }
  }, [auth.loading, auth.session?.user?.id]);

  const initApp = async () => {
    try {
      const users = await api.getDemoUsers();
      setDemoUsers(users);

      // 1. Check if user is logged in via Supabase / OAuth
      if (auth.session?.user) {
        const supaUser = auth.session.user;
        const meta = supaUser.user_metadata || {};
        const provider = supaUser.app_metadata?.provider === "azure" ? "microsoft" : "google";
        
        // Sync with backend to ensure user record and tasks are generated
        try {
          const oauthRes = await api.oauthLogin({
            provider: provider,
            email: supaUser.email || "",
            full_name: meta.full_name || meta.name || supaUser.email?.split("@")[0] || "New Joiner",
            role: meta.role || "Software Engineer",
            department: meta.department || "Engineering",
            location: meta.work_location || meta.location || "Redmond, WA",
          });
          setCurrentUser(oauthRes.user);
          setToken(oauthRes.access_token);
          if (typeof window !== "undefined") {
            localStorage.setItem("launchmate_auth_token", oauthRes.access_token);
            localStorage.setItem("launchmate_user_id", oauthRes.user.id);
          }
          const [userTasks, taskStats] = await Promise.all([
            api.getTasks(oauthRes.access_token),
            api.getTaskStats(oauthRes.access_token),
          ]);
          setTasks(userTasks);
          setStats(taskStats);
          setLoading(false);
          return;
        } catch (oauthErr) {
          console.warn("OAuth sync error:", oauthErr);
        }
      }

      // 2. Check localStorage saved session
      const savedToken = typeof window !== "undefined" ? localStorage.getItem("launchmate_auth_token") : null;
      const savedUserId = typeof window !== "undefined" ? localStorage.getItem("launchmate_user_id") : null;
      if (savedToken && savedUserId) {
        try {
          const userMatch = users.find((u) => u.id === savedUserId);
          if (userMatch) {
            await switchUser(savedUserId, false);
            setLoading(false);
            return;
          }
        } catch (e) {
          // Fall through
        }
      }

      // 3. Fallback: Pre-select Parth Parashar in background without forcing into app directly
      const explicitlyLoggedOut = typeof window !== "undefined" ? localStorage.getItem("launchmate_logged_out") : null;
      if (!explicitlyLoggedOut && users.length > 0) {
        const parthUser = users.find((u) => u.full_name.toLowerCase().includes("parth") || u.email.includes("346789"));
        const initialJoiner = parthUser || users.find((u) => !u.is_admin) || users[0];
        await switchUser(initialJoiner.id, false);
      }
    } catch (err) {
      console.error("Init error:", err);
    } finally {
      setLoading(false);
    }
  };

  const switchUser = async (userId: string, shouldOpenApp: boolean = true) => {
    try {
      const result = await api.quickSwitch(userId);
      setCurrentUser(result.user);
      setToken(result.access_token);
      if (shouldOpenApp) {
        setShowApp(true);
      }
      if (typeof window !== "undefined") {
        localStorage.setItem("launchmate_auth_token", result.access_token);
        localStorage.setItem("launchmate_user_id", result.user.id);
        localStorage.removeItem("launchmate_logged_out");
      }

      // Load that user's tasks
      const [userTasks, taskStats] = await Promise.all([
        api.getTasks(result.access_token),
        api.getTaskStats(result.access_token),
      ]);
      setTasks(userTasks);
      setStats(taskStats);
    } catch (err) {
      console.error("Switch user failed:", err);
    }
  };

  const handleAuthSuccess = async (user: User, authToken: string) => {
    setCurrentUser(user);
    setToken(authToken);
    setShowApp(true);
    if (typeof window !== "undefined") {
      localStorage.setItem("launchmate_auth_token", authToken);
      localStorage.setItem("launchmate_user_id", user.id);
      localStorage.removeItem("launchmate_logged_out");
    }
    setShowAuthModal(false);
    await loadUserData(authToken);
    const updatedUsers = await api.getDemoUsers();
    setDemoUsers(updatedUsers);
  };

  const loadUserData = async (authToken = token) => {
    if (!authToken) return;
    try {
      const [userTasks, taskStats] = await Promise.all([
        api.getTasks(authToken),
        api.getTaskStats(authToken),
      ]);
      setTasks(userTasks);
      setStats(taskStats);
    } catch (err) {
      console.error("Error loading user tasks and stats", err);
    }
  };

  const handleToggleTaskStatus = async (task: Task) => {
    const newStatus = task.status === "completed" ? "pending" : "completed";
    try {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus as any } : t))
      );
      await api.updateTaskStatus(token, task.id, newStatus);
      await loadUserData();
    } catch (err) {
      console.error("Failed to update status", err);
      await loadUserData();
    }
  };

  const handleSetTaskStatus = async (task: Task, newStatus: string) => {
    try {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: newStatus as any } : t))
      );
      await api.updateTaskStatus(token, task.id, newStatus);
      await loadUserData();
    } catch (err) {
      console.error("Failed to update status", err);
      await loadUserData();
    }
  };

  const handleReportIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueSummary.trim()) return;
    setSubmittingIssue(true);
    setIssueSuccessMsg(null);
    try {
      const res = await api.escalateIssue(token, {
        reason: issueReason,
        summary: issueSummary,
        priority: "high"
      });
      setIssueSuccessMsg("✅ Issue ticket submitted! HR Operations has been notified.");
      setIssueSummary("");
      setTimeout(() => {
        setShowIssueModal(false);
        setIssueSuccessMsg(null);
      }, 2500);
    } catch (err: any) {
      alert(err.message || "Failed to submit issue");
    } finally {
      setSubmittingIssue(false);
    }
  };

  // Timeline / Day Grouping helper
  const getTaskDayBucket = (task: Task): string => {
    const desc = (task.description || "").toLowerCase();
    const title = task.title.toLowerCase();
    
    if (title.includes("mfa") || title.includes("orientation") || title.includes("welcome")) {
      return "Day 1";
    }
    if (title.includes("intune") || title.includes("laptop") || title.includes("github") || title.includes("security badge")) {
      return "Day 2";
    }
    if (title.includes("buddy") || title.includes("development") || title.includes("coffee") || title.includes("docker")) {
      return "Day 3";
    }
    if (title.includes("conduct") || title.includes("training") || title.includes("compliance") || title.includes("pension")) {
      return "Day 4-5";
    }
    return "Week 2+";
  };

  const categories = ["All", "IT", "HR", "Training", "Legal", "Team", "General"];
  const dayBuckets = ["All", "Day 1", "Day 2", "Day 3", "Day 4-5", "Week 2+"];
  const taskTypes = ["All", "General", "Role-specific", "Location-specific", "HR Assigned"];

  const filteredTasks = tasks.filter((t) => {
    const matchesCategory = categoryFilter === "All" || t.category === categoryFilter;
    const matchesDay = dayFilter === "All" || getTaskDayBucket(t) === dayFilter;
    const matchesType =
      taskTypeFilter === "All" ||
      (taskTypeFilter === "General" && (!t.task_type || t.task_type === "general")) ||
      (taskTypeFilter === "Role-specific" && t.task_type === "role_specific") ||
      (taskTypeFilter === "Location-specific" && t.task_type === "location_specific") ||
      (taskTypeFilter === "HR Assigned" && t.task_type === "hr_custom");
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesDay && matchesType && matchesSearch;
  });

  // Calculate overdue tasks for reminder banner
  const overdueCount = stats?.overdue_tasks || 0;
  const pendingCount = stats?.pending_tasks || 0;

  // ─── Loading spinner ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#080810] flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shadow-xl animate-glow">
            <img src="/logo.png" alt="Launch Mate" className="w-10 h-10 object-contain invert brightness-200" />
          </div>
          <p className="text-sm font-semibold text-white/50 tracking-widest uppercase">Loading Launch Mate...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a14] flex flex-col font-sans">
      {/* Enterprise Header (Shown inside workspace) */}
      {showApp && (
        <header className="bg-[#0f0f1e]/90 border-b border-white/8 sticky top-0 z-40 backdrop-blur-xl shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-2 flex items-center justify-between gap-3">
          {/* Logo & Branding */}
          <div
            onClick={() => setShowApp(false)}
            className="flex items-center gap-3 shrink-0 cursor-pointer group"
            title="Return to Microsoft Launch Mate Landing Page"
          >
            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 border border-white/20 shadow-md shrink-0 group-hover:bg-white/15 transition-all">
              <img src="/logo.png" alt="Launch Mate" className="w-6 h-6 object-contain invert brightness-200" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 whitespace-nowrap">
                <span className="font-extrabold text-white text-base tracking-tight group-hover:text-indigo-300 transition-colors">Launch Mate</span>
                <span className="text-white/20 font-light">|</span>
                <span className="font-semibold text-indigo-400 text-xs sm:text-sm">
                  {currentUser?.is_admin ? "HR Management & Monitoring Center" : "Employee Onboarding Center"}
                </span>
              </div>
              <span className="text-[10px] text-white/30 font-medium whitespace-nowrap hidden sm:block">
                Microsoft Innovate 2026 • Problem Statement PS15
              </span>
            </div>
          </div>

          {/* Actions & Role Switcher */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0 flex-wrap justify-end">
            {/* Quick Action Buttons for Employees */}
            {currentUser && !currentUser.is_admin && (
              <>
                <button
                  onClick={() => setShowIssueModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold text-xs rounded-xl shadow-2xs transition-all active:scale-95 shrink-0"
                  title="Report an onboarding issue or request HR help"
                >
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />
                  <span className="hidden sm:inline">Report Issue / Escalate</span>
                  <span className="sm:hidden">Report</span>
                </button>

                <button
                  onClick={() => {
                    setCallTopic("Direct call from top navigation");
                    setShowCallModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
                  title="Speak directly to an assigned HR / IT onboarding agent"
                >
                  <PhoneCall className="w-3.5 h-3.5 text-amber-300" />
                  <span className="hidden sm:inline">Contact HR / Call</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
                </button>
              </>
            )}

            {/* Dedicated Google & Microsoft Login button (only show when not logged in) */}
            {!currentUser && (
              <button
                onClick={() => setShowAuthModal(true)}
                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                title="Sign In or Register with Google, Microsoft, or Email"
              >
                {/* Google & Microsoft dual-badge icon */}
                <div className="flex items-center -space-x-1">
                  <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center p-0.5 shadow-xs">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                    </svg>
                  </div>
                  <div className="w-4 h-4 rounded-full bg-white flex items-center justify-center p-0.5 shadow-xs">
                    <div className="grid grid-cols-2 gap-0.25 w-2 h-2">
                      <span className="bg-[#f25022]"></span>
                      <span className="bg-[#7fba00]"></span>
                      <span className="bg-[#00a4ef]"></span>
                      <span className="bg-[#ffb900]"></span>
                    </div>
                  </div>
                </div>
                <span className="hidden sm:inline">Sign In / Register</span>
                <span className="sm:hidden">Login</span>
              </button>
            )}

            {/* Role / User Selector Dropdown */}
            {currentUser && demoUsers.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 bg-white/5 border border-white/10 px-2.5 py-1.5 rounded-xl shrink-0 hover:bg-white/10 transition-all cursor-pointer"
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs uppercase shadow-xs shrink-0 ${
                    currentUser.is_admin ? "bg-amber-600 text-white" : "bg-blue-600 text-white"
                  }`}>
                    {currentUser.is_admin ? <Shield className="w-3.5 h-3.5" /> : currentUser.full_name?.charAt(0) || "U"}
                  </div>
                  <div className="text-left hidden lg:block max-w-[190px]">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-bold text-white truncate">{currentUser.full_name}</p>
                      <span className={`px-1.5 py-0.2 text-[9px] font-extrabold rounded uppercase ${
                        currentUser.is_admin ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"
                      }`}>
                        {currentUser.is_admin ? "HR Admin" : "Joinee"}
                      </span>
                    </div>
                    <p className="text-[10px] text-white/40 -mt-0.5 truncate">
                      {currentUser.role} • {currentUser.location}
                    </p>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-white/40" />
                </button>

                {/* Dropdown Menu */}
                {showUserDropdown && (
                  <div className="absolute right-0 mt-2 w-80 bg-[#1a1a2e] border border-white/10 rounded-2xl shadow-xl z-50 overflow-hidden divide-y divide-white/5">
                    {/* Section 1: Role Switcher */}
                    <div className="p-3 bg-white/5">
                      <p className="text-[10px] text-white/50 font-bold uppercase tracking-wider">
                        Active Profiles
                      </p>
                    </div>

                    <div className="p-2 space-y-1">
                      {/* HR Admin Option */}
                      {demoUsers.filter((u) => u.is_admin).map((u) => (
                        <button
                          key={u.id}
                          onClick={async () => {
                            setShowUserDropdown(false);
                            await switchUser(u.id);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all ${
                            currentUser.id === u.id ? "bg-amber-500/10 border border-amber-500/30" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                            <Shield className="w-4 h-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <p className="text-xs font-bold text-white truncate">{u.full_name}</p>
                              <span className="px-1.5 py-0.2 bg-amber-500/20 text-amber-300 text-[9px] font-extrabold rounded">
                                HR ADMIN
                              </span>
                            </div>
                            <p className="text-[10px] text-white/40">Access HR Management Center</p>
                          </div>
                          {currentUser.id === u.id && <CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />}
                        </button>
                      ))}

                      {/* New Joinee Options (Parth Parashar / Custom Joinees) */}
                      <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider px-2 pt-2 pb-1">
                        Employee Joinee Profile
                      </p>
                      {demoUsers.filter((u) => !u.is_admin).map((u) => (
                        <button
                          key={u.id}
                          onClick={async () => {
                            setShowUserDropdown(false);
                            await switchUser(u.id);
                          }}
                          className={`w-full text-left p-2.5 rounded-xl flex items-center gap-3 transition-all ${
                            currentUser.id === u.id ? "bg-blue-500/10 border border-blue-500/30" : "hover:bg-white/5"
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase shrink-0 shadow-2xs">
                            {u.full_name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-white truncate">{u.full_name}</p>
                            <p className="text-[10px] text-white/40 truncate">{u.role} • {u.location}</p>
                          </div>
                          {currentUser.id === u.id && <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />}
                        </button>
                      ))}
                    </div>

                    <div className="p-2 bg-white/5 space-y-1">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          setShowAuthModal(true);
                        }}
                        className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-white/70 hover:bg-white/5 rounded-xl transition-all"
                      >
                        <UserPlus className="w-4 h-4 text-blue-400" />
                        <span className="text-xs font-semibold">Sign in with Google / Microsoft / Email</span>
                      </button>

                      {currentUser && (
                        <button
                          onClick={async () => {
                            setShowUserDropdown(false);
                            if (auth.user) {
                              await auth.signOut();
                            }
                            if (typeof window !== "undefined") {
                              localStorage.removeItem("launchmate_auth_token");
                              localStorage.removeItem("launchmate_user_id");
                              localStorage.setItem("launchmate_logged_out", "true");
                            }
                            setCurrentUser(null);
                            setToken("");
                            setShowApp(false);
                            setTasks([]);
                            setStats(null);
                          }}
                          className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                        >
                          <LogOut className="w-4 h-4 text-red-400" />
                          <span className="text-xs font-semibold">Sign Out from Session</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      {/* Close dropdown backdrop */}
      {showUserDropdown && (
        <div className="fixed inset-0 z-30" onClick={() => setShowUserDropdown(false)} />
      )}

      {/* Main Content Area */}
      {!showApp ? (
        /* ─── EXACT UNFOLD-STYLE MICROSOFT LANDING PAGE ─── */
        <main className="relative flex-1 w-full min-h-screen overflow-hidden bg-[#06060c] flex flex-col justify-between">
          {/* Ambient Lighting Backdrops */}
          <div className="absolute top-[20%] right-[10%] w-[550px] h-[550px] bg-gradient-to-tr from-indigo-600/25 via-purple-600/20 to-blue-500/20 rounded-full blur-[140px] pointer-events-none" />
          <div className="absolute top-[-10%] left-[-10%] w-[450px] h-[450px] bg-blue-600/10 rounded-full blur-[120px] pointer-events-none" />

          {/* Top Header Branding identical to Unfold reference */}
          <div className="relative z-30 pt-8 sm:pt-12 px-6 sm:px-12 max-w-7xl mx-auto w-full flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 p-2.5 shadow-2xl flex items-center justify-center backdrop-blur-xl">
                <img src="/logo.png" alt="Logo" className="w-7 h-7 object-contain invert brightness-200" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-black text-white tracking-tight">Microsoft</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Launch Mate
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {currentUser ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-white/70 hidden sm:inline">Signed in as <strong className="text-white">{currentUser.full_name}</strong></span>
                  <button
                    onClick={() => setShowApp(true)}
                    className="px-5 py-2.5 text-xs font-bold bg-white text-black hover:bg-white/90 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
                  >
                    <span>Enter Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => setShowAuthModal(true)}
                    className="px-4 py-2 text-xs font-semibold text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all"
                  >
                    Sign In / Register
                  </button>
                  <button
                    onClick={() => setShowApp(true)}
                    className="px-5 py-2.5 text-xs font-bold bg-white text-black hover:bg-white/90 rounded-xl shadow-lg transition-transform active:scale-95 flex items-center gap-1.5"
                  >
                    <span>Enter Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Hero Section: Two-Column Side-by-Side (Text on Left, Elevated Floating 3D Cards on Right) */}
          <div className="relative z-20 px-6 sm:px-12 max-w-7xl mx-auto w-full flex-1 flex flex-col lg:flex-row items-center justify-between gap-8 sm:gap-12 py-6 sm:py-10">
            
            {/* Left Column: Huge Headline + Tagline + Actions */}
            <div className="w-full lg:w-1/2 space-y-6 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-white/5 border border-white/10 text-indigo-300 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Next-Gen Intelligent Employee Onboarding</span>
              </div>

              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white tracking-tight leading-[1.02]">
                Microsoft <br />
                <span className="text-white">Launch Mate.</span>
              </h1>

              <p className="text-xl sm:text-2xl font-medium text-white/80 tracking-tight">
                Your personalised onboarding assistant.
              </p>

              <p className="text-sm sm:text-base text-white/50 max-w-lg leading-relaxed">
                Engineered for new joiners across engineering, sales, and operations. Dynamic role-based checklists, grounded AI knowledge, and instantaneous IT provisioning.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  onClick={() => setShowApp(true)}
                  className="px-8 py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-indigo-500/25 transition-all transform hover:-translate-y-0.5 active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  <span>Open Your Onboarding Center</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="px-6 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-white font-semibold text-sm border border-white/10 transition-all flex items-center gap-2"
                >
                  <Users className="w-4 h-4 text-indigo-400" />
                  <span>Switch Joinee Profile</span>
                </button>
              </div>

              {/* Joinee Profiles Quick Access */}
              <div className="pt-4 flex items-center gap-3 text-xs text-white/40">
                <span>Quick demo joiner:</span>
                <button
                  onClick={async () => {
                    const parth = demoUsers.find((u) => u.full_name.toLowerCase().includes("parth")) || demoUsers[0];
                    if (parth) await switchUser(parth.id, true);
                  }}
                  className="text-white/80 hover:text-white font-semibold underline underline-offset-4 decoration-indigo-500/50"
                >
                  Parth Parashar (Software Engineer) →
                </button>
              </div>
            </div>

            {/* Right Column: Elevated 3D Floating Isometric Cards beside the title */}
            <div className="w-full lg:w-1/2 relative h-[420px] sm:h-[500px] lg:h-[560px] perspective-unfold flex items-center justify-center pointer-events-auto">
              <div className="w-[520px] sm:w-[620px] lg:w-[680px] h-[520px] sm:h-[600px] isometric-grid animate-isometric-drift flex flex-wrap gap-5 items-center justify-center">
                
                {/* Tile 1: Vibrant Purple Gradient - AI Copilot */}
                <div className="w-56 sm:w-68 h-40 sm:h-44 rounded-3xl bg-gradient-to-br from-purple-700 via-indigo-900 to-[#120826] p-4 sm:p-5 card-glass-glow border border-purple-400/40 flex flex-col justify-between animate-iso-1 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shadow-lg">
                      <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                    </div>
                    <span className="text-[9px] font-extrabold text-purple-200 uppercase tracking-widest bg-purple-500/20 px-2 py-0.5 rounded-full border border-purple-400/30">
                      Azure OpenAI
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight">AI Policy Copilot</h3>
                    <p className="text-[10px] sm:text-xs text-purple-100/70 mt-0.5 leading-snug">Grounded instant answers across 20+ policy documents.</p>
                  </div>
                </div>

                {/* Tile 2: Emerald Green - Security & MFA */}
                <div className="w-56 sm:w-68 h-40 sm:h-44 rounded-3xl bg-gradient-to-br from-emerald-900 via-[#0a2315] to-[#030e06] p-4 sm:p-5 card-glass-glow border border-emerald-500/40 flex flex-col justify-between animate-iso-2 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shadow-lg border border-emerald-500/30">
                      <Shield className="w-4 h-4 text-emerald-300" />
                    </div>
                    <span className="text-[9px] font-extrabold text-emerald-300 uppercase tracking-widest bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-500/30">
                      Security Hub
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight">Intune & MFA</h3>
                    <p className="text-[10px] sm:text-xs text-emerald-100/60 mt-0.5 leading-snug">Automated compliance token verification for your role.</p>
                  </div>
                </div>

                {/* Tile 3: Vibrant Blue - Dynamic Milestones */}
                <div className="w-56 sm:w-68 h-40 sm:h-44 rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-700 to-[#081230] p-4 sm:p-5 card-glass-glow border border-blue-400/50 flex flex-col justify-between animate-iso-3 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-white/20 text-white flex items-center justify-center shadow-lg backdrop-blur-md">
                      <Calendar className="w-4 h-4 text-blue-200" />
                    </div>
                    <span className="text-[9px] font-extrabold text-blue-200 uppercase tracking-widest bg-blue-500/30 px-2 py-0.5 rounded-full border border-blue-400/30">
                      Day 1 → Day 30
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight">Dynamic Checklist</h3>
                    <p className="text-[10px] sm:text-xs text-blue-100/70 mt-0.5 leading-snug">Personalized by engineering role, location & department.</p>
                  </div>
                </div>

                {/* Tile 4: Slate Dark Glass - Buddy & Mentorship */}
                <div className="w-56 sm:w-68 h-40 sm:h-44 rounded-3xl bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#040814] p-4 sm:p-5 card-glass-glow border border-white/25 flex flex-col justify-between animate-iso-4 cursor-pointer">
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center shadow-lg border border-indigo-500/30">
                      <HeartHandshake className="w-4 h-4 text-indigo-300" />
                    </div>
                    <span className="text-[9px] font-extrabold text-indigo-300 uppercase tracking-widest bg-indigo-500/20 px-2 py-0.5 rounded-full border border-indigo-500/30">
                      Meet the Team
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-white tracking-tight">Buddy & Mentors</h3>
                    <p className="text-[10px] sm:text-xs text-slate-300/60 mt-0.5 leading-snug">Connected with senior engineers and onboarding guides.</p>
                  </div>
                </div>

              </div>
            </div>

          </div>

          {/* Bottom Footer Note */}
          <div className="relative z-20 border-t border-white/5 py-4 px-6 sm:px-12 max-w-7xl mx-auto w-full flex items-center justify-between text-[11px] text-white/30">
            <span>Microsoft Innovate 2026 • Problem Statement PS15</span>
            <span>Intelligent Enterprise Onboarding Architecture</span>
          </div>
        </main>
      ) : (
        /* ─── AUTHENTICATED MAIN CONTENT AREA (The Dashboard We Built) ─── */
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          {/* Proactive Reminder / Notification Toast (if tasks overdue or due soon) */}
          {!dismissReminder && overdueCount > 0 && !currentUser?.is_admin && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs shadow-2xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500/20 text-red-400 rounded-xl shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <p className="font-bold text-red-300">
                    Launch Mate Action Reminder: You have {overdueCount} overdue onboarding {overdueCount === 1 ? "task" : "tasks"}!
                  </p>
                  <p className="text-red-400/80 text-[11px] mt-0.5">
                    Please complete required milestones (e.g. MFA Setup or Intune Enrollment) to ensure unimpeded corporate access.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDismissReminder(true)}
                className="text-red-400/60 hover:text-red-300 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Feature Navigation Bar (Onboarding Milestones | Jira Sprint Board | Enterprise Chat & Teams) */}
          <div className="flex items-center gap-2 border-b border-white/10 pb-4">
            <button
              onClick={() => setMainTab("onboarding")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainTab === "onboarding"
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30"
                  : "bg-white/5 hover:bg-white/10 text-white/60"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Onboarding Journey</span>
            </button>

            <button
              onClick={() => setMainTab("jira")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainTab === "jira"
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "bg-white/5 hover:bg-white/10 text-white/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-indigo-300" />
              <span>Jira Software (Plan • Track • Release • Support)</span>
            </button>

            <button
              onClick={() => setMainTab("chat")}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                mainTab === "chat"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "bg-white/5 hover:bg-white/10 text-white/60"
              }`}
            >
              <BookOpen className="w-3.5 h-3.5 text-purple-300" />
              <span>Cohort Chat & Teams Meetings</span>
            </button>
          </div>

          {/* Dynamic View: HR Admin Portal vs New Joinee Dashboard */}
          {currentUser?.is_admin ? (
            <AdminPortal token={token} onRefreshStats={() => loadUserData(token)} />
          ) : mainTab === "jira" ? (
            <KanbanBoard />
          ) : mainTab === "chat" ? (
            <ChatRoom />
          ) : (
            /* ─── NEW JOINEE DASHBOARD ─── */
            <div className="space-y-6">
            {/* Personalized Welcome Hero Banner */}
            <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
              
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md border border-white/20 text-blue-100">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    Launch Mate • Launch Mate Employee Onboarding
                  </div>
                  <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Welcome to the team, {currentUser?.full_name || "New Joiner"}!
                  </h1>
                  <p className="text-sm text-blue-100 max-w-2xl leading-relaxed">
                    Personalized onboarding journey for your role as <strong>{currentUser?.role || "Software Engineer"}</strong> based in <strong>{currentUser?.location || "Redmond, WA"}</strong>. Everything you need to get set up, stay on track, and find answers in one place.
                  </p>
                </div>

                {/* Overall Onboarding Completion Radial / KPI */}
                {stats && (
                  <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-5 shrink-0 flex items-center gap-5">
                    <div className="text-center">
                      <span className="text-3xl font-extrabold text-white tracking-tight">
                        {stats.completion_percentage}%
                      </span>
                      <p className="text-[11px] text-blue-200 uppercase font-semibold tracking-wider mt-0.5">
                        Completed
                      </p>
                    </div>
                    <div className="h-10 w-px bg-white/20" />
                    <div className="text-xs space-y-1 text-blue-100">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
                        <span>{stats.completed_tasks} completed</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-300" />
                        <span>{stats.pending_tasks} pending</span>
                      </div>
                      {stats.overdue_tasks > 0 && (
                        <div className="flex items-center gap-1.5 text-red-200 font-bold">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-300" />
                          <span>{stats.overdue_tasks} overdue</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Core Orientation Card: What do I need to do and where can I get help? */}
            <div className="bg-[#2a2a3a] rounded-2xl border border-gray-600 p-5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <LifeBuoy className="w-4 h-4 text-blue-400" /> What do I need to do and where can I get help?
                </h3>
                <p className="text-xs text-white/50">
                  Follow your personalized Day-by-Day milestones below. Use the bottom-right AI Assistant to ask any question about leave, equipment, benefits, or policies!
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setShowIssueModal(true)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 font-semibold text-xs rounded-xl transition-colors border border-white/10"
                >
                  Report an Issue
                </button>
                <button
                  onClick={() => {
                    setCallTopic("Employee requesting HR assistance");
                    setShowCallModal(true);
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors"
                >
                  Get Human Help
                </button>
              </div>
            </div>

            {/* Day / Milestone Navigation Filter Chips */}
            <div className="bg-[#16162a] rounded-2xl border border-white/10 p-4 shadow-2xs space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1 sm:pb-0">
                  <span className="text-xs font-bold text-white/50 uppercase tracking-wider mr-1">Timeline:</span>
                  {dayBuckets.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDayFilter(d)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                        dayFilter === d
                          ? "bg-blue-600 text-white shadow-2xs"
                          : "bg-white/5 hover:bg-white/10 text-white/60 border border-white/10"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>

                {/* Search Bar */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-white/30 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search milestones..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs bg-white/5 text-white placeholder-white/30 focus:bg-white/10 rounded-xl border border-white/10 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* Task Type Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2 border-t border-white/5">
                <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider mr-1">Type:</span>
                {taskTypes.map((type) => (
                  <button
                    key={type}
                    onClick={() => setTaskTypeFilter(type)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
                      taskTypeFilter === type
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-white/5 hover:bg-white/10 text-white/60"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              {/* Category Filter Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pt-2 border-t border-white/5">
                <span className="text-[11px] font-bold text-white/40 uppercase tracking-wider mr-1">Category:</span>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
                      categoryFilter === cat
                        ? "bg-white text-[#0a0a14]"
                        : "bg-white/5 hover:bg-white/10 text-white/60"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Task Checklist Items */}
            <div className="bg-[#12121f] rounded-2xl border border-white/10 shadow-2xs divide-y divide-white/5 overflow-hidden">
              <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white text-sm">Personalized Onboarding Milestones</h3>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded-full">
                    {filteredTasks.length} tasks
                  </span>
                </div>
                <button
                  onClick={() => loadUserData()}
                  className="text-xs text-white/40 hover:text-white/80 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync
                </button>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-white/30 text-xs">
                  No tasks match your selected timeline or filter.
                </div>
              ) : (
                filteredTasks.map((task) => {
                  const dayBucket = getTaskDayBucket(task);
                  return (
                    <div
                      key={task.id}
                      className={`p-4 sm:p-5 flex items-start gap-4 transition-all hover:bg-white/5 ${
                        task.status === "completed" ? "bg-white/[0.02] opacity-60" : ""
                      }`}
                    >
                      {/* Interactive Checkbox (Idempotent) */}
                      <button
                        onClick={() => handleToggleTaskStatus(task)}
                        className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                          task.status === "completed"
                            ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                            : task.status === "in_progress"
                            ? "border-blue-500 bg-blue-500/10 text-blue-400"
                            : "border-white/20 hover:border-blue-500 bg-white/5"
                        }`}
                        title={task.status === "completed" ? "Mark incomplete" : "Mark completed"}
                      >
                        {task.status === "completed" && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                        {task.status === "in_progress" && <Clock className="w-3.5 h-3.5 animate-spin" />}
                      </button>

                      {/* Task Title & Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className={`text-xs font-bold ${
                              task.status === "completed"
                                ? "line-through text-white/30"
                                : "text-white"
                            }`}
                          >
                            {task.title}
                          </span>

                          {/* Task Origin / Type Badge */}
                          {(!task.task_type || task.task_type === "general") && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-white/10 text-white/60 border border-white/10">
                              General
                            </span>
                          )}
                          {task.task_type === "role_specific" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 flex items-center gap-1">
                              <Briefcase className="w-2.5 h-2.5" /> Role Specific
                            </span>
                          )}
                          {task.task_type === "location_specific" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" /> Location Specific
                            </span>
                          )}
                          {task.task_type === "hr_custom" && (
                            <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> HR Assigned
                            </span>
                          )}

                          {/* Day Milestone Badge */}
                          <span className="px-2 py-0.5 text-[10px] font-extrabold rounded bg-blue-500/10 text-blue-300 border border-blue-500/20">
                            {dayBucket}
                          </span>

                          {/* Category Pill */}
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-white/10 text-white/70">
                            {task.category}
                          </span>

                          {/* Mandatory vs Optional */}
                          {task.mandatory !== false ? (
                            <span className="px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                              Mandatory
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.2 text-[9px] font-medium text-white/40">
                              Optional
                            </span>
                          )}

                          {/* Reference Doc Pill */}
                          {task.reference_doc && (
                            <span className="px-2 py-0.5 text-[10px] font-medium rounded-md bg-blue-500/10 text-blue-300 border border-blue-500/20 flex items-center gap-1" title="Reference document in company knowledge base">
                              <BookOpen className="w-2.5 h-2.5" /> Ref: {task.reference_doc}
                            </span>
                          )}

                          {/* Priority Badge */}
                          <span
                            className={`px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded ${
                              task.priority === "high"
                                ? "bg-red-500/15 text-red-300 border border-red-500/30"
                                : "bg-white/5 text-white/40 border border-white/10"
                            }`}
                          >
                            {task.priority}
                          </span>

                          {/* Status Badge */}
                          {task.status === "in_progress" && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
                              In Progress
                            </span>
                          )}
                          {task.status === "overdue" && (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-500/20 text-red-300 border border-red-500/30 animate-pulse">
                              Overdue
                            </span>
                          )}
                        </div>

                        {task.description && (
                          <p className="text-xs text-white/60 leading-relaxed max-w-3xl">
                            {task.description}
                          </p>
                        )}

                        {/* Due date info & Status Action Buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-1">
                          <div className="flex items-center gap-2 text-[11px] text-white/40">
                            {task.due_date && (
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-white/40" />
                                <span>
                                  Due {new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                                </span>
                              </div>
                            )}
                            {task.completed_at && (
                              <span className="text-emerald-400 font-medium">
                                • Completed on {new Date(task.completed_at).toLocaleDateString()}
                              </span>
                            )}
                          </div>

                          {/* Lifecycle Quick Action Buttons */}
                          <div className="flex items-center gap-2 shrink-0">
                            {task.status === "pending" && (
                              <button
                                onClick={() => handleSetTaskStatus(task, "in_progress")}
                                className="px-2.5 py-1 text-[11px] font-semibold text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg flex items-center gap-1 transition-all"
                              >
                                <PlayCircle className="w-3 h-3" /> Start Task
                              </button>
                            )}
                            {task.status === "in_progress" && (
                              <button
                                onClick={() => handleSetTaskStatus(task, "completed")}
                                className="px-2.5 py-1 text-[11px] font-semibold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg flex items-center gap-1 transition-all"
                              >
                                <CheckCircle2 className="w-3 h-3" /> Mark Complete
                              </button>
                            )}
                            {task.status === "completed" && (
                              <button
                                onClick={() => handleSetTaskStatus(task, "in_progress")}
                                className="px-2 py-0.5 text-[10px] text-white/40 hover:text-white/70 transition-colors"
                              >
                                Reopen
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            </div>
          )}
        </main>
      )}

      {/* Floating AI Chatbot Assistant Widget */}
      {token && currentUser && (
        <ChatWidget
          token={token}
          currentUser={currentUser}
          onTaskUpdated={() => loadUserData(token)}
          onCallAgent={(topic) => {
            setCallTopic(topic || "Unresolved chat query");
            setShowCallModal(true);
          }}
        />
      )}

      {/* Multi-Provider Auth Modal */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
        />
      )}

      {/* Live Agent Phone Support Modal */}
      {showCallModal && (
        <CallAgentModal
          token={token || ""}
          currentUser={currentUser}
          initialTopic={callTopic}
          onClose={() => setShowCallModal(false)}
        />
      )}

      {/* Report Issue / Escalate to HR Modal */}
      {showIssueModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fadeIn">
          <form
            onSubmit={handleReportIssue}
            className="bg-[#12121f] rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-white/10 space-y-4 text-white"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-400" /> Report Issue / Escalate to HR
              </h3>
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="text-white/40 hover:text-white/80 p-1"
              >
                ✕
              </button>
            </div>

            {issueSuccessMsg && (
              <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-semibold">
                {issueSuccessMsg}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-white/70">Issue Category</label>
                <select
                  value={issueReason}
                  onChange={(e) => setIssueReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 text-xs bg-white/5 border border-white/10 text-white rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="IT Equipment / Hardware" className="bg-[#12121f] text-white">IT Equipment / Laptop / Hardware Issue</option>
                  <option value="Account & Software Access" className="bg-[#12121f] text-white">Software Access (GitHub, Azure, Intune)</option>
                  <option value="Payroll & Compensation" className="bg-[#12121f] text-white">Payroll / Direct Deposit / Benefits</option>
                  <option value="Workplace Accommodations" className="bg-[#12121f] text-white">Ergonomics & Home Office Stipend</option>
                  <option value="Policy Clarification" className="bg-[#12121f] text-white">Policy Clarification / Leave Query</option>
                  <option value="Confidential Concern" className="bg-[#12121f] text-white">Confidential Workplace Concern</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-white/70">Describe the Issue</label>
                <textarea
                  required
                  rows={4}
                  value={issueSummary}
                  onChange={(e) => setIssueSummary(e.target.value)}
                  placeholder="Explain what problem you are facing or what guidance you need from HR..."
                  className="w-full mt-1 p-3 text-xs bg-white/5 border border-white/10 text-white placeholder-white/30 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white/50 hover:bg-white/5 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingIssue}
                className="px-4 py-2 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-xs disabled:opacity-50"
              >
                {submittingIssue ? "Submitting..." : "Submit Ticket to HR"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
