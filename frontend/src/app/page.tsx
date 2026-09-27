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
  ArrowRight,
  ExternalLink,
  Laptop,
  HeartHandshake
} from "lucide-react";
import { api, User, Task, TaskStats } from "../lib/api";
import ChatWidget from "../components/ChatWidget";
import AdminPortal from "../components/AdminPortal";

export default function DashboardPage() {
  const [demoUsers, setDemoUsers] = useState<User[]>([]);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [token, setToken] = useState<string>("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activePortalTab, setActivePortalTab] = useState<"checklist" | "admin">("checklist");

  // Load demo users on initial mount
  useEffect(() => {
    initApp();
  }, []);

  const initApp = async () => {
    setLoading(true);
    try {
      const users = await api.getDemoUsers();
      setDemoUsers(users);
      
      // Default to Sarah Chen (Software Engineer)
      const defaultUser = users.find((u) => !u.is_admin) || users[0];
      if (defaultUser) {
        await switchUser(defaultUser);
      }
    } catch (err) {
      console.error("Initialization error", err);
    } finally {
      setLoading(false);
    }
  };

  const switchUser = async (user: User) => {
    setLoading(true);
    try {
      // Login as selected user to get auth token
      const authData = await api.login(user.email, "Password123!");
      setToken(authData.access_token);
      setCurrentUser(authData.user);
      
      // If user is admin, default to admin portal
      if (authData.user.is_admin) {
        setActivePortalTab("admin");
      } else {
        setActivePortalTab("checklist");
      }

      await loadUserData(authData.access_token);
    } catch (err) {
      console.error("Failed to switch user", err);
    } finally {
      setLoading(false);
    }
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
      // Optimistic update
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

  const categories = ["All", "IT", "HR", "Training", "Legal", "Team", "General"];

  const filteredTasks = tasks.filter((t) => {
    const matchesCategory = categoryFilter === "All" || t.category === categoryFilter;
    const matchesSearch =
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Microsoft Innovate Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Hackathon Badge */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Sparkles className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-base tracking-tight">Contoso</span>
                <span className="text-slate-400 font-light">|</span>
                <span className="font-semibold text-blue-600 text-sm">AI Onboarding Assistant</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium">Microsoft Innovate 2026 • Problem Statement PS15</span>
            </div>
          </div>

          {/* Persona Switcher & Portal Mode */}
          <div className="flex items-center gap-3">
            {/* View Switcher Tabs */}
            <div className="hidden sm:flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setActivePortalTab("checklist")}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  activePortalTab === "checklist"
                    ? "bg-white text-blue-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Joiner Checklist
              </button>
              <button
                onClick={() => setActivePortalTab("admin")}
                className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                  activePortalTab === "admin"
                    ? "bg-white text-blue-700 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Shield className="w-3.5 h-3.5" /> HR / Admin Portal
              </button>
            </div>

            {/* User Dropdown Selector */}
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl">
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-2xs">
                {currentUser?.full_name?.charAt(0) || "U"}
              </div>
              <div className="text-left hidden md:block">
                <select
                  value={currentUser?.id || ""}
                  onChange={(e) => {
                    const u = demoUsers.find((x) => x.id === e.target.value);
                    if (u) switchUser(u);
                  }}
                  className="bg-transparent text-xs font-bold text-slate-800 outline-none cursor-pointer pr-1"
                >
                  {demoUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name} ({u.role}) {u.is_admin ? "★ Admin" : ""}
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 -mt-0.5">
                  {currentUser?.location} • {currentUser?.department}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Welcome Hero Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/10 backdrop-blur-md border border-white/20 text-blue-100">
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                Microsoft Contoso Onboarding Experience
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Welcome to Contoso, {currentUser?.full_name}!
              </h1>
              <p className="text-sm text-blue-100 max-w-xl">
                Personalized onboarding guide for your role as <strong>{currentUser?.role}</strong> in <strong>{currentUser?.location}</strong>. Grounded in official company handbooks, with agent automation and human support.
              </p>
            </div>

            {/* Progress Radial / Stats Pill */}
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

        {/* View Switcher Body: Joiner Checklist vs Admin Portal */}
        {activePortalTab === "admin" ? (
          <AdminPortal token={token} onRefreshStats={() => loadUserData(token)} />
        ) : (
          <div className="space-y-6">
            {/* KPI Cards */}
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Tasks</span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-slate-900">{stats.total_tasks}</span>
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Layers className="w-5 h-5" />
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full"
                      style={{ width: `${stats.completion_percentage}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed</span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-emerald-600">{stats.completed_tasks}</span>
                    <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">{stats.completion_percentage}% of total list</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Action</span>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-2xl font-bold text-amber-600">{stats.pending_tasks}</span>
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                      <Clock className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">Scheduled across weeks 1-4</p>
                </div>

                <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-2xs">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overdue Alerts</span>
                  <div className="flex items-center justify-between mt-2">
                    <span className={`text-2xl font-bold ${stats.overdue_tasks > 0 ? "text-red-600" : "text-slate-400"}`}>
                      {stats.overdue_tasks}
                    </span>
                    <div className={`p-2 rounded-xl ${stats.overdue_tasks > 0 ? "bg-red-50 text-red-600" : "bg-slate-50 text-slate-400"}`}>
                      <AlertTriangle className="w-5 h-5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-3">
                    {stats.overdue_tasks > 0 ? "Slack & Email nudge queued" : "All tasks on schedule"}
                  </p>
                </div>
              </div>
            )}

            {/* Checklist Filters & Search */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row items-center justify-between gap-4">
              {/* Category Chips */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto scrollbar-none pb-1 sm:pb-0">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                      categoryFilter === cat
                        ? "bg-blue-600 text-white shadow-2xs"
                        : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter tasks..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-100 outline-none"
                />
              </div>
            </div>

            {/* Task Checklist Items */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs divide-y divide-slate-100 overflow-hidden">
              <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-sm">Personalized Onboarding Milestones</h3>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">
                    {filteredTasks.length} tasks
                  </span>
                </div>
                <button
                  onClick={() => loadUserData()}
                  className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Sync
                </button>
              </div>

              {filteredTasks.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  No tasks match your selected filter.
                </div>
              ) : (
                filteredTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`p-4 sm:p-5 flex items-start gap-4 transition-all hover:bg-slate-50/80 ${
                      task.status === "completed" ? "bg-slate-50/40 opacity-75" : ""
                    }`}
                  >
                    {/* Interactive Checkbox (Idempotent) */}
                    <button
                      onClick={() => handleToggleTaskStatus(task)}
                      className={`mt-0.5 w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${
                        task.status === "completed"
                          ? "bg-emerald-600 border-emerald-600 text-white shadow-2xs"
                          : "border-slate-300 hover:border-blue-500 bg-white"
                      }`}
                      title={task.status === "completed" ? "Mark incomplete" : "Mark completed"}
                    >
                      {task.status === "completed" && <CheckCircle2 className="w-4 h-4 stroke-[3]" />}
                    </button>

                    {/* Task Title & Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span
                          className={`text-xs font-bold ${
                            task.status === "completed"
                              ? "line-through text-slate-400"
                              : "text-slate-900"
                          }`}
                        >
                          {task.title}
                        </span>

                        {/* Category Pill */}
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-600">
                          {task.category}
                        </span>

                        {/* Priority Badge */}
                        <span
                          className={`px-1.5 py-0.2 text-[9px] font-extrabold uppercase rounded ${
                            task.priority === "high"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-slate-50 text-slate-500"
                          }`}
                        >
                          {task.priority}
                        </span>

                        {/* Overdue Badge */}
                        {task.status === "overdue" && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-800 border border-red-200 animate-pulse">
                            Overdue
                          </span>
                        )}
                      </div>

                      {task.description && (
                        <p className="text-xs text-slate-500 leading-relaxed max-w-3xl">
                          {task.description}
                        </p>
                      )}

                      {/* Due date info */}
                      {task.due_date && (
                        <div className="flex items-center gap-2 mt-2 text-[11px] text-slate-400">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>
                            Due {new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </span>
                          {task.completed_at && (
                            <span className="text-emerald-600 font-medium">
                              • Completed on {new Date(task.completed_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Chatbot Assistant Widget */}
      {token && currentUser && (
        <ChatWidget
          token={token}
          currentUser={currentUser}
          onTaskUpdated={() => loadUserData(token)}
        />
      )}
    </div>
  );
}
