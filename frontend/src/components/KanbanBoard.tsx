"use client";

import React, { useState, useEffect } from "react";
import { 
  Kanban, Plus, Clock, AlertCircle, CheckCircle2, 
  MessageSquare, ChevronRight, User, Tag, Sparkles, Filter,
  Layers, Rocket, Headphones, Calendar, ArrowRight, Play,
  Check, FileText, ChevronDown, Search, GitBranch, RefreshCw,
  TrendingUp, Shield, Laptop, Zap, ExternalLink, X, Bug, Bookmark, CheckSquare
} from "lucide-react";

interface SubTask {
  id: string;
  title: string;
  is_done: boolean;
}

interface JiraTask {
  id: string;
  key: string;
  title: string;
  description?: string;
  type: string; // task | bug | story | epic
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "urgent" | "high" | "medium" | "low";
  due_date?: string;
  sla_hours?: number;
  story_points?: number;
  assignee_name?: string;
  reporter_name?: string;
  category?: string;
  time_spent_hours?: number;
  extra_json?: {
    sprint?: string;
    epic?: string;
    release?: string;
  };
  subtasks: SubTask[];
}

interface ReleaseVersion {
  id: string;
  name: string;
  version: string;
  status: "released" | "in_progress" | "unreleased";
  release_date: string;
  progress_percent: number;
  total_issues: number;
  completed_issues: number;
  story_points: number;
  description: string;
  release_notes: string[];
}

interface SupportTicket {
  id: string;
  key: string;
  summary: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  customer: string;
  assignee: string;
  created_at: string;
  sla_time_left: string;
  sla_status: string;
  sla_target_hours: number;
}

const COLUMNS = [
  { id: "todo", title: "To Do", bg: "bg-slate-900/40", border: "border-slate-800", dot: "bg-slate-400" },
  { id: "in_progress", title: "In Progress", bg: "bg-blue-950/20", border: "border-blue-900/30", dot: "bg-blue-400", wipLimit: 4 },
  { id: "in_review", title: "Code Review", bg: "bg-purple-950/20", border: "border-purple-900/30", dot: "bg-purple-400" },
  { id: "done", title: "Done", bg: "bg-emerald-950/20", border: "border-emerald-900/30", dot: "bg-emerald-400" },
];

export default function KanbanBoard() {
  // Main Jira navigation pillar: "plan" | "track" | "release" | "support"
  const [jiraPillar, setJiraPillar] = useState<"plan" | "track" | "release" | "support">("track");
  
  const [tasks, setTasks] = useState<JiraTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<JiraTask | null>(null);
  
  // Quick Filters on Board
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  
  // Create Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState<"story" | "task" | "bug" | "epic">("story");
  const [newPriority, setNewPriority] = useState<"urgent" | "high" | "medium" | "low">("high");
  const [newPoints, setNewPoints] = useState(3);
  const [newSprint, setNewSprint] = useState("Sprint 1 (Active)");
  const [newEpic, setNewEpic] = useState("Cloud Platform");

  // Releases state
  const [releases, setReleases] = useState<ReleaseVersion[]>([]);
  const [deployingReleaseId, setDeployingReleaseId] = useState<string | null>(null);
  const [deploySuccessMsg, setDeploySuccessMsg] = useState<string | null>(null);

  // Support desk state
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([]);
  const [showNewTicketModal, setShowNewTicketModal] = useState(false);
  const [ticketSummary, setTicketSummary] = useState("");
  const [ticketDesc, setTicketDesc] = useState("");
  const [ticketCategory, setTicketCategory] = useState("Cloud & Infrastructure");
  const [ticketPriority, setTicketPriority] = useState("high");

  // Worklog / Comments state on drawer
  const [newComment, setNewComment] = useState("");
  const [commentsList, setCommentsList] = useState<string[]>([
    "Setup verified with IT Security checklist. Ready for code review.",
    "Added automated test assertions for token expiration handling."
  ]);

  const fetchTasks = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/jira/tasks");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error("Failed to load Jira tasks:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchReleases = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/jira/releases/overview");
      if (res.ok) {
        const data = await res.json();
        setReleases(data);
      }
    } catch (e) {
      console.error("Failed to load releases:", e);
    }
  };

  const fetchSupportTickets = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/jira/support/tickets");
      if (res.ok) {
        const data = await res.json();
        setSupportTickets(data);
      }
    } catch (e) {
      console.error("Failed to load support tickets:", e);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchReleases();
    fetchSupportTickets();
  }, []);

  const moveTask = async (taskId: string, newStatus: string) => {
    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => prev ? { ...prev, status: newStatus as any } : null);
    }

    try {
      await fetch(`http://localhost:8000/api/v1/jira/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {
      console.error("Failed to update status:", e);
      fetchTasks();
    }
  };

  const toggleSubtask = async (taskId: string, subtaskId: string, currentDone: boolean) => {
    // Optimistic update
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, is_done: !currentDone } : st)
      };
    }));

    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask(prev => {
        if (!prev) return null;
        return {
          ...prev,
          subtasks: prev.subtasks.map(st => st.id === subtaskId ? { ...st, is_done: !currentDone } : st)
        };
      });
    }

    try {
      await fetch(`http://localhost:8000/api/v1/jira/subtasks/${subtaskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_done: !currentDone })
      });
    } catch (e) {
      console.error("Failed to update subtask:", e);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await fetch("http://localhost:8000/api/v1/jira/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDesc,
          type: newType,
          priority: newPriority,
          story_points: newPoints,
          status: "todo",
          category: "Engineering",
          extra_json: {
            sprint: newSprint,
            epic: newEpic,
            release: "v1.1.0"
          }
        })
      });
      if (res.ok) {
        setNewTitle("");
        setNewDesc("");
        setShowCreateModal(false);
        fetchTasks();
      }
    } catch (e) {
      console.error("Failed to create Jira task:", e);
    }
  };

  const handleDeployRelease = async (releaseId: string) => {
    setDeployingReleaseId(releaseId);
    try {
      const res = await fetch(`http://localhost:8000/api/v1/jira/releases/${releaseId}/deploy`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setDeploySuccessMsg(`🚀 ${data.message} (Pipeline: ${data.pipeline_id})`);
        setTimeout(() => setDeploySuccessMsg(null), 5000);
      }
    } catch (e) {
      console.error("Deploy failed:", e);
    } finally {
      setDeployingReleaseId(null);
    }
  };

  const handleCreateSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketSummary.trim()) return;

    try {
      const res = await fetch("http://localhost:8000/api/v1/jira/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: ticketSummary,
          description: ticketDesc,
          category: ticketCategory,
          priority: ticketPriority,
          customer: "Elena Rostova"
        })
      });
      if (res.ok) {
        setTicketSummary("");
        setTicketDesc("");
        setShowNewTicketModal(false);
        fetchSupportTickets();
      }
    } catch (e) {
      console.error("Failed to create ticket:", e);
    }
  };

  const handleResolveTicket = async (ticketId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/jira/support/tickets/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "Resolved" })
      });
      if (res.ok) {
        fetchSupportTickets();
      }
    } catch (e) {
      console.error("Failed to resolve ticket:", e);
    }
  };

  // Helper type icons
  const renderTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case "story":
        return <Bookmark className="w-3.5 h-3.5 text-emerald-400" title="User Story" />;
      case "bug":
        return <Bug className="w-3.5 h-3.5 text-red-400" title="Bug / Defect" />;
      case "epic":
        return <Zap className="w-3.5 h-3.5 text-purple-400" title="Epic Initiative" />;
      default:
        return <CheckSquare className="w-3.5 h-3.5 text-blue-400" title="Engineering Task" />;
    }
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "text-red-400 bg-red-500/10 border-red-500/30";
      case "high": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      case "medium": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
      default: return "text-slate-400 bg-slate-500/10 border-slate-500/30";
    }
  };

  // Filtered tasks for Board
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = searchQuery === "" || 
      t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = filterType === "all" || t.type.toLowerCase() === filterType.toLowerCase();
    const matchesPriority = filterPriority === "all" || t.priority.toLowerCase() === filterPriority.toLowerCase();
    return matchesSearch && matchesType && matchesPriority;
  });

  // Sprint story point metrics
  const activeSprintTasks = tasks.filter(t => (t.extra_json?.sprint || "Sprint 1 (Active)").includes("Sprint 1"));
  const totalPoints = activeSprintTasks.reduce((acc, t) => acc + (t.story_points || 1), 0);
  const completedPoints = activeSprintTasks.filter(t => t.status === "done").reduce((acc, t) => acc + (t.story_points || 1), 0);
  const sprintProgress = totalPoints > 0 ? Math.round((completedPoints / totalPoints) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* ─── JIRA TOP BAR & TAGLINE ─── */}
      <div className="bg-[#121324] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                <Kanban className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-white tracking-tight">LaunchMate Software (LM)</h2>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    JIRA CLOUD ENTERPRISE
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-0.5">
                  Built for every software team member to <strong className="text-white/80">Plan</strong>, <strong className="text-white/80">Track</strong>, <strong className="text-white/80">Release</strong>, and <strong className="text-white/80">Support</strong> great software with confidence.
                </p>
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Create Issue</span>
            </button>
            <button
              onClick={fetchTasks}
              className="p-2 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl text-xs transition-all border border-white/10"
              title="Refresh Jira Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── 4 CORE PILLARS NAVIGATION ─── */}
        <div className="flex items-center gap-2 mt-6 pt-5 border-t border-white/10 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setJiraPillar("plan")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              jiraPillar === "plan"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-indigo-300" />
            <span>1. Plan (Backlog & Roadmap)</span>
          </button>

          <button
            onClick={() => setJiraPillar("track")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              jiraPillar === "track"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
          >
            <Kanban className="w-3.5 h-3.5 text-blue-300" />
            <span>2. Track (Active Board)</span>
          </button>

          <button
            onClick={() => setJiraPillar("release")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              jiraPillar === "release"
                ? "bg-purple-600 text-white shadow-md shadow-purple-600/30"
                : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
          >
            <Rocket className="w-3.5 h-3.5 text-purple-300" />
            <span>3. Release (Versions & Hub)</span>
          </button>

          <button
            onClick={() => setJiraPillar("support")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              jiraPillar === "support"
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-600/30"
                : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
          >
            <Headphones className="w-3.5 h-3.5 text-emerald-300" />
            <span>4. Support (Service Desk & SLAs)</span>
          </button>
        </div>
      </div>

      {/* Global Deploy Notification Banner if available */}
      {deploySuccessMsg && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs font-medium flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{deploySuccessMsg}</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ─── PILLAR 1: PLAN (BACKLOG, ROADMAP & SPRINTS) ─────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {jiraPillar === "plan" && (
        <div className="space-y-6 animate-fadeIn">
          {/* Active Sprint Overview Card */}
          <div className="bg-[#121324] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Sprint 1 (Active)</h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    6 DAYS REMAINING
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-1">
                  Goal: Establish zero-trust identity, configure local K8s dev containers, and submit initial pull requests.
                </p>
              </div>

              {/* Story Point Burnup */}
              <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl p-3 shrink-0">
                <div>
                  <div className="text-[10px] text-white/40 uppercase font-bold tracking-wider">Sprint Scope</div>
                  <div className="text-sm font-bold text-white mt-0.5">
                    <span className="text-emerald-400">{completedPoints}</span> / {totalPoints} Story Pts
                  </div>
                </div>
                <div className="w-24 bg-white/10 h-2 rounded-full overflow-hidden">
                  <div 
                    className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${sprintProgress}%` }}
                  />
                </div>
              </div>
            </div>

            {/* List of issues in Active Sprint */}
            <div className="space-y-2 pt-2">
              <div className="text-xs font-semibold text-white/60">Sprint Issues ({activeSprintTasks.length})</div>
              {activeSprintTasks.map((t) => (
                <div 
                  key={t.id}
                  onClick={() => setSelectedTask(t)}
                  className="flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-xl text-xs transition-colors cursor-pointer group"
                >
                  <div className="flex items-center gap-3">
                    {renderTypeIcon(t.type)}
                    <span className="font-mono text-white/50 text-[11px] group-hover:text-blue-400">{t.key}</span>
                    <span className="text-white font-medium">{t.title}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${priorityColor(t.priority)}`}>
                      {t.priority}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] bg-white/10 text-white/70 font-mono">
                      {t.story_points || 1} pts
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] capitalize bg-blue-500/20 text-blue-300">
                      {t.status.replace("_", " ")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Epic Roadmap Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#121324] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-purple-400">
                  <Zap className="w-3.5 h-3.5" /> [EPIC] Cloud Platform
                </span>
                <span className="text-white/50">80% Done</span>
              </div>
              <p className="text-[11px] text-white/50">Kubernetes manifests, Terraform IAC, Azure AD federations.</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="bg-purple-500 h-full w-[80%]" />
              </div>
            </div>

            <div className="bg-[#121324] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Zap className="w-3.5 h-3.5" /> [EPIC] Core Microservices
                </span>
                <span className="text-white/50">50% Done</span>
              </div>
              <p className="text-[11px] text-white/50">Auth Service, GraphQL gateways, WebSocket push notifications.</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="bg-blue-500 h-full w-[50%]" />
              </div>
            </div>

            <div className="bg-[#121324] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Zap className="w-3.5 h-3.5" /> [EPIC] Zero-Trust Security
                </span>
                <span className="text-white/50">30% Done</span>
              </div>
              <p className="text-[11px] text-white/50">SOC-2 Type II audit trail, Intune compliance, automated rotation.</p>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="bg-emerald-500 h-full w-[30%]" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ─── PILLAR 2: TRACK (ACTIVE SPRINT BOARD / KANBAN) ──────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {jiraPillar === "track" && (
        <div className="space-y-4 animate-fadeIn">
          {/* Quick Filters Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#121324] border border-white/10 rounded-2xl text-xs">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-3.5 h-3.5 text-white/40 absolute left-3 top-2.5" />
                <input 
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by issue key (LM-5) or title..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-white placeholder:text-white/30 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
              <span className="text-white/40 text-[11px] font-semibold flex items-center gap-1">
                <Filter className="w-3 h-3" /> Type:
              </span>
              {["all", "story", "bug", "task"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-2.5 py-1 rounded-lg uppercase text-[10px] font-bold transition-colors ${
                    filterType === t 
                      ? "bg-blue-600 text-white" 
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {t}
                </button>
              ))}

              <span className="text-white/40 text-[11px] font-semibold ml-2">Priority:</span>
              {["all", "urgent", "high", "medium"].map((p) => (
                <button
                  key={p}
                  onClick={() => setFilterPriority(p)}
                  className={`px-2.5 py-1 rounded-lg uppercase text-[10px] font-bold transition-colors ${
                    filterPriority === p 
                      ? "bg-indigo-600 text-white" 
                      : "bg-white/5 text-white/60 hover:text-white hover:bg-white/10"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Kanban Columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const colTasks = filteredTasks.filter((t) => t.status === col.id);
              const isWipExceeded = col.wipLimit && colTasks.length > col.wipLimit;

              return (
                <div 
                  key={col.id} 
                  className={`flex flex-col rounded-2xl border ${col.border} ${col.bg} p-4 min-h-[500px] backdrop-blur-md`}
                >
                  {/* Column Header */}
                  <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                      <h3 className="font-bold text-sm text-white tracking-wide">{col.title}</h3>
                      <span className="text-xs text-white/40 font-mono bg-white/5 px-2 py-0.5 rounded-full">
                        {colTasks.length}
                      </span>
                    </div>

                    {col.wipLimit && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isWipExceeded ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-white/40"
                      }`}>
                        WIP: {colTasks.length}/{col.wipLimit}
                      </span>
                    )}
                  </div>

                  {/* Task Cards List */}
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {colTasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="p-3.5 bg-[#121324] hover:bg-[#1a1b32] border border-white/10 hover:border-blue-500/50 rounded-xl shadow-lg transition-all cursor-pointer group space-y-2.5"
                      >
                        {/* Card Header: Type, Key, Points */}
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5">
                            {renderTypeIcon(task.type)}
                            <span className="font-mono text-white/50 text-[11px] group-hover:text-blue-400">
                              {task.key}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            {task.story_points && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-white/60 font-mono font-bold">
                                {task.story_points} pts
                              </span>
                            )}
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${priorityColor(task.priority)}`}>
                              {task.priority}
                            </span>
                          </div>
                        </div>

                        {/* Title */}
                        <h4 className="text-xs font-semibold text-white leading-snug line-clamp-2 group-hover:text-white">
                          {task.title}
                        </h4>

                        {/* Epic Tag */}
                        {task.extra_json?.epic && (
                          <div className="text-[10px] text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded w-fit font-medium">
                            {task.extra_json.epic}
                          </div>
                        )}

                        {/* Footer: Assignee & Transition Buttons */}
                        <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[11px]">
                          <div className="flex items-center gap-1.5 text-white/50">
                            <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] text-white font-bold">
                              {(task.assignee_name || "U")[0]}
                            </div>
                            <span className="text-[10px] truncate max-w-[80px]">
                              {task.assignee_name || "Unassigned"}
                            </span>
                          </div>

                          {/* Quick Transition Arrows */}
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            {col.id !== "todo" && (
                              <button
                                onClick={() => {
                                  const idx = COLUMNS.findIndex(c => c.id === col.id);
                                  if (idx > 0) moveTask(task.id, COLUMNS[idx - 1].id);
                                }}
                                title="Move Back"
                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
                              >
                                ←
                              </button>
                            )}
                            {col.id !== "done" && (
                              <button
                                onClick={() => {
                                  const idx = COLUMNS.findIndex(c => c.id === col.id);
                                  if (idx < COLUMNS.length - 1) moveTask(task.id, COLUMNS[idx + 1].id);
                                }}
                                title="Move Forward"
                                className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white transition-colors"
                              >
                                →
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {colTasks.length === 0 && (
                      <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-xl text-white/20 text-xs">
                        <span>No issues in this column</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ─── PILLAR 3: RELEASE (VERSIONS & RELEASE HUB) ─────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {jiraPillar === "release" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121324] border border-white/10 rounded-2xl p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Rocket className="w-4 h-4 text-purple-400" />
                LaunchMate Release Hub & Deployment Registry
              </h3>
              <p className="text-xs text-white/50 mt-1">
                Track version readiness, verify test coverage, and ship releases to production with full traceability.
              </p>
            </div>

            <div className="space-y-4 pt-2">
              {releases.map((rel) => (
                <div 
                  key={rel.id}
                  className="p-5 bg-white/5 border border-white/10 rounded-2xl space-y-3 hover:border-purple-500/40 transition-all"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h4 className="text-sm font-bold text-white">{rel.name}</h4>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                          rel.status === "released"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : rel.status === "in_progress"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                        }`}>
                          {rel.status.replace("_", " ")}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 mt-1">{rel.description}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-xs font-bold text-white">{rel.progress_percent}% Ready</div>
                        <div className="text-[10px] text-white/40">{rel.completed_issues}/{rel.total_issues} Issues Finished</div>
                      </div>
                      <button
                        onClick={() => handleDeployRelease(rel.id)}
                        disabled={deployingReleaseId === rel.id}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                          rel.status === "released"
                            ? "bg-white/10 text-white/60 cursor-not-allowed"
                            : "bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/30 active:scale-95"
                        }`}
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>{deployingReleaseId === rel.id ? "Deploying..." : "Deploy / Ship"}</span>
                      </button>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        rel.progress_percent === 100 ? "bg-emerald-500" : "bg-purple-500"
                      }`}
                      style={{ width: `${rel.progress_percent}%` }}
                    />
                  </div>

                  {/* Release Notes Preview */}
                  <div className="pt-2 border-t border-white/5 space-y-1">
                    <span className="text-[11px] font-semibold text-white/40">Release Highlights:</span>
                    <ul className="text-xs text-white/70 space-y-1 pl-4 list-disc">
                      {rel.release_notes.map((note, nIdx) => (
                        <li key={nIdx}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ─── PILLAR 4: SUPPORT (JIRA SERVICE MANAGEMENT & SLAs) ─────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {jiraPillar === "support" && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121324] border border-white/10 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Headphones className="w-4 h-4 text-emerald-400" />
                  Jira Service Management (IT & HR Support Queue)
                </h3>
                <p className="text-xs text-white/50 mt-1">
                  Manage employee requests, cloud access approvals, and track SLA response targets in real time.
                </p>
              </div>

              <button
                onClick={() => setShowNewTicketModal(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 self-start"
              >
                <Plus className="w-4 h-4" />
                <span>Raise Support Ticket</span>
              </button>
            </div>

            {/* Ticket Queue List */}
            <div className="space-y-3 pt-2">
              {supportTickets.map((t) => (
                <div 
                  key={t.id}
                  className="p-4 bg-white/5 border border-white/10 rounded-2xl hover:border-emerald-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400 text-xs font-bold">{t.key}</span>
                      <span className="text-white text-xs font-bold">{t.summary}</span>
                    </div>
                    <p className="text-[11px] text-white/50 leading-relaxed">{t.description}</p>
                    <div className="flex items-center gap-3 text-[10px] text-white/40 pt-1">
                      <span>Category: <strong className="text-white/70">{t.category}</strong></span>
                      <span>Customer: <strong className="text-white/70">{t.customer}</strong></span>
                      <span>Assignee: <strong className="text-white/70">{t.assignee}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                    {/* SLA Badge */}
                    <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
                      t.sla_status === "urgent_warning"
                        ? "bg-red-500/10 text-red-400 border-red-500/30 animate-pulse"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}>
                      <Clock className="w-3.5 h-3.5" />
                      <span>SLA: {t.sla_time_left}</span>
                    </div>

                    {t.status !== "Resolved" ? (
                      <button
                        onClick={() => handleResolveTicket(t.id)}
                        className="px-3 py-1.5 bg-white/10 hover:bg-emerald-600 text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        Resolve
                      </button>
                    ) : (
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-300 rounded-lg text-xs font-bold">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* ─── ISSUE DETAIL DRAWER / MODAL ────────────────────────────── */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {selectedTask && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-end animate-fadeIn">
          <div className="w-full max-w-2xl h-full bg-[#121324] border-l border-white/10 p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-6 text-white">
            <div className="space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/10">
                <div className="flex items-center gap-2">
                  {renderTypeIcon(selectedTask.type)}
                  <span className="font-mono text-sm font-bold text-blue-400">{selectedTask.key}</span>
                  <span className="text-white/40">•</span>
                  <span className="text-xs uppercase font-bold text-white/60">{selectedTask.type}</span>
                </div>
                <button
                  onClick={() => setSelectedTask(null)}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-white/50 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Title & Status Transition Dropdown */}
              <div className="space-y-3">
                <h3 className="text-lg font-bold text-white leading-snug">{selectedTask.title}</h3>

                <div className="flex items-center gap-3">
                  <span className="text-xs text-white/40">Status:</span>
                  <select
                    value={selectedTask.status}
                    onChange={(e) => moveTask(selectedTask.id, e.target.value)}
                    className="bg-white/5 border border-white/10 text-white rounded-xl px-3 py-1.5 text-xs font-semibold focus:outline-none focus:border-blue-500"
                  >
                    <option value="todo" className="bg-[#121324]">To Do</option>
                    <option value="in_progress" className="bg-[#121324]">In Progress</option>
                    <option value="in_review" className="bg-[#121324]">Code Review</option>
                    <option value="done" className="bg-[#121324]">Done</option>
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">Description</h4>
                <div className="p-3 bg-white/5 border border-white/10 rounded-xl text-xs text-white/80 leading-relaxed whitespace-pre-wrap">
                  {selectedTask.description || "No detailed specification provided."}
                </div>
              </div>

              {/* Subtasks Checklist */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">
                    Subtasks ({selectedTask.subtasks?.filter(s => s.is_done).length || 0}/{selectedTask.subtasks?.length || 0})
                  </h4>
                </div>
                <div className="space-y-1.5">
                  {(selectedTask.subtasks || []).map((st) => (
                    <div 
                      key={st.id}
                      onClick={() => toggleSubtask(selectedTask.id, st.id, st.is_done)}
                      className="flex items-center gap-2.5 p-2 bg-white/5 hover:bg-white/10 rounded-xl cursor-pointer text-xs transition-colors"
                    >
                      <input 
                        type="checkbox" 
                        checked={st.is_done} 
                        onChange={() => {}} 
                        className="rounded border-white/20 bg-white/10 text-blue-600 focus:ring-0" 
                      />
                      <span className={st.is_done ? "line-through text-white/40" : "text-white/90"}>
                        {st.title}
                      </span>
                    </div>
                  ))}
                  {(!selectedTask.subtasks || selectedTask.subtasks.length === 0) && (
                    <p className="text-xs text-white/30 italic">No subtasks defined.</p>
                  )}
                </div>
              </div>

              {/* Metadata Details Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-white/5 border border-white/10 rounded-2xl text-xs">
                <div>
                  <span className="text-white/40 block text-[10px]">Assignee:</span>
                  <span className="font-semibold text-white">{selectedTask.assignee_name || "Elena Rostova"}</span>
                </div>
                <div>
                  <span className="text-white/40 block text-[10px]">Story Points:</span>
                  <span className="font-semibold text-blue-400">{selectedTask.story_points || 2} pts</span>
                </div>
                <div>
                  <span className="text-white/40 block text-[10px]">Sprint:</span>
                  <span className="font-semibold text-white">{selectedTask.extra_json?.sprint || "Sprint 1 (Active)"}</span>
                </div>
                <div>
                  <span className="text-white/40 block text-[10px]">Priority:</span>
                  <span className={`font-semibold capitalize ${priorityColor(selectedTask.priority).split(" ")[0]}`}>
                    {selectedTask.priority}
                  </span>
                </div>
              </div>

              {/* Comments & Activity Log */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-white/50 uppercase tracking-wider">Activity & Comments</h4>
                <div className="space-y-2">
                  {commentsList.map((c, idx) => (
                    <div key={idx} className="p-2.5 bg-white/5 rounded-xl text-xs text-white/70 border border-white/5">
                      <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                        <strong className="text-white/60">Elena Rostova</strong>
                        <span>Today</span>
                      </div>
                      <p>{c}</p>
                    </div>
                  ))}
                </div>

                <div className="flex gap-2 pt-1">
                  <input
                    type="text"
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Add a comment or worklog note..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => {
                      if (!newComment.trim()) return;
                      setCommentsList(prev => [...prev, newComment]);
                      setNewComment("");
                    }}
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
                  >
                    Post
                  </button>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setSelectedTask(null)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE ISSUE MODAL ─── */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#121324] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-4 h-4 text-blue-400" />
                Create Jira Issue
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-3 text-xs">
              <div>
                <label className="block text-white/60 mb-1">Issue Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: "story", label: "Story", icon: Bookmark, color: "text-emerald-400" },
                    { id: "bug", label: "Bug", icon: Bug, color: "text-red-400" },
                    { id: "task", label: "Task", icon: CheckSquare, color: "text-blue-400" },
                    { id: "epic", label: "Epic", icon: Zap, color: "text-purple-400" }
                  ].map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setNewType(t.id as any)}
                      className={`p-2 rounded-xl border flex flex-col items-center gap-1 font-semibold transition-all ${
                        newType === t.id 
                          ? "bg-white/10 border-blue-500 text-white" 
                          : "border-white/5 bg-white/5 text-white/50"
                      }`}
                    >
                      <t.icon className={`w-4 h-4 ${t.color}`} />
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white/60 mb-1">Summary *</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Implement OAuth2 Refresh Token Rotation in Gateway"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-white/60 mb-1">Description</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Technical acceptance criteria and implementation notes..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-white/60 mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="urgent" className="bg-[#121324]">Urgent</option>
                    <option value="high" className="bg-[#121324]">High</option>
                    <option value="medium" className="bg-[#121324]">Medium</option>
                    <option value="low" className="bg-[#121324]">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white/60 mb-1">Story Points</label>
                  <input
                    type="number"
                    min={1}
                    max={21}
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-white/60 mb-1">Sprint</label>
                  <select
                    value={newSprint}
                    onChange={(e) => setNewSprint(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="Sprint 1 (Active)" className="bg-[#121324]">Sprint 1 (Active)</option>
                    <option value="Sprint 2 (Upcoming)" className="bg-[#121324]">Sprint 2 (Upcoming)</option>
                    <option value="Product Backlog" className="bg-[#121324]">Product Backlog</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold shadow-lg shadow-blue-600/30"
                >
                  Create Issue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── RAISE SUPPORT TICKET MODAL ─── */}
      {showNewTicketModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#121324] border border-white/10 rounded-3xl p-6 w-full max-w-lg shadow-2xl text-white space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Headphones className="w-4 h-4 text-emerald-400" />
                Raise Jira Service Desk Request
              </h3>
              <button onClick={() => setShowNewTicketModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupportTicket} className="space-y-3 text-xs">
              <div>
                <label className="block text-white/60 mb-1">Request Summary *</label>
                <input
                  type="text"
                  required
                  value={ticketSummary}
                  onChange={(e) => setTicketSummary(e.target.value)}
                  placeholder="e.g. Request Production Azure Contributor Role"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-white/60 mb-1">Details & Justification</label>
                <textarea
                  rows={3}
                  value={ticketDesc}
                  onChange={(e) => setTicketDesc(e.target.value)}
                  placeholder="Explain why this access or hardware is needed..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white placeholder:text-white/30 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-white/60 mb-1">Category</label>
                  <select
                    value={ticketCategory}
                    onChange={(e) => setTicketCategory(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="Cloud & Infrastructure" className="bg-[#121324]">Cloud & Infrastructure</option>
                    <option value="Hardware & Equipment" className="bg-[#121324]">Hardware & Equipment</option>
                    <option value="Software Licensing" className="bg-[#121324]">Software Licensing</option>
                    <option value="Security & Network" className="bg-[#121324]">Security & Network</option>
                  </select>
                </div>

                <div>
                  <label className="block text-white/60 mb-1">Urgency</label>
                  <select
                    value={ticketPriority}
                    onChange={(e) => setTicketPriority(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="urgent" className="bg-[#121324]">Urgent (2h SLA)</option>
                    <option value="high" className="bg-[#121324]">High (4h SLA)</option>
                    <option value="medium" className="bg-[#121324]">Medium (8h SLA)</option>
                    <option value="low" className="bg-[#121324]">Low (24h SLA)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowNewTicketModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-semibold shadow-lg shadow-emerald-600/30"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
