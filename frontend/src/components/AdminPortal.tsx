"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  ShieldAlert,
  ListTodo,
  Bell,
  BookOpen,
  CheckCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  Plus,
  Trash2,
  Send,
  Mail,
  Calendar,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  PhoneCall,
  Edit2,
  HelpCircle,
  FileText,
  ChevronRight,
  UserPlus,
  Sparkles,
  Search,
  CheckCircle2,
  Upload,
  X,
  Layers,
  Megaphone
} from "lucide-react";
import {
  api,
  Escalation,
  ChecklistTemplate,
  DocumentItem,
  Task
} from "../lib/api";

interface AdminPortalProps {
  token: string;
  onRefreshStats?: () => void;
  onSwitchTab?: (tab: "jira" | "chat" | "onboarding") => void;
}

export default function AdminPortal({ token, onRefreshStats, onSwitchTab }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<
    "joiners" | "escalations" | "templates" | "nudges" | "documents" | "questions" | "calls"
  >("joiners");
  
  // State
  const [joiners, setJoiners] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [commonQuestions, setCommonQuestions] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Calls and Live Agent Support Lines State
  const [callRequests, setCallRequests] = useState<any[]>([]);
  const [agentLines, setAgentLines] = useState<any[]>([]);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState<string>("");

  // Resolution modal state
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  // Individual Employee Inspection Modal
  const [selectedJoiner, setSelectedJoiner] = useState<any | null>(null);
  const [selectedJoinerTasks, setSelectedJoinerTasks] = useState<Task[]>([]);
  const [loadingJoinerTasks, setLoadingJoinerTasks] = useState(false);

  // Add Employee Modal
  const [showAddJoinerModal, setShowAddJoinerModal] = useState(false);
  const [addingJoiner, setAddingJoiner] = useState(false);
  const [newJoinerData, setNewJoinerData] = useState({
    full_name: "",
    email: "",
    role: "Backend Engineer",
    department: "Engineering",
    location: "Redmond, WA",
    experience_level: "Mid-Level",
    phone_number: "+1 425 555 0199",
    password: "Password123!"
  });

  // Upload Document Modal
  const [showUploadDocModal, setShowUploadDocModal] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docUploadMode, setDocUploadMode] = useState<"file" | "text">("file");
  const [selectedDocFile, setSelectedDocFile] = useState<File | null>(null);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);
  const [newDocData, setNewDocData] = useState({
    title: "",
    category: "HR",
    source_file: "",
    content: ""
  });

  // New template / workflow modal state
  const [templateFilter, setTemplateFilter] = useState<string>("All");
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    description: "",
    template_type: "role",
    role: "Backend Engineer",
    location: "All",
    department: "Engineering",
    category: "IT",
    due_days_from_hire: 2,
    priority: "high",
    mandatory: true,
    reference_doc: "",
    required: true
  });

  // Assign task with custom deadline state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningTask, setAssigningTask] = useState(false);
  const [assignTaskData, setAssignTaskData] = useState({
    target_type: "individual" as "individual" | "role" | "department" | "location" | "all",
    user_id: "",
    target_role: "Backend Engineer",
    target_department: "Engineering",
    target_location: "Redmond, WA",
    title: "",
    description: "",
    category: "IT",
    priority: "high",
    due_date: "",
    mandatory: true,
    reference_doc: "",
    send_sms_notification: true,
    send_email_notification: true
  });

  // Announcement Broadcast Modal State & Handler
  const [showBroadcastModal, setShowBroadcastModal] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementBody, setAnnouncementBody] = useState("");
  const [broadcastSuccess, setBroadcastSuccess] = useState<string | null>(null);

  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle.trim() || !announcementBody.trim()) return;
    setBroadcasting(true);
    try {
      const res = await fetch("http://localhost:8000/api/v1/enterprise/announcements", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: announcementTitle,
          body: announcementBody
        })
      });
      if (res.ok) {
        setBroadcastSuccess("📢 Announcement published to cohort chat & dispatched to all employee emails via SendGrid!");
        setAnnouncementTitle("");
        setAnnouncementBody("");
        setShowBroadcastModal(false);
        setTimeout(() => setBroadcastSuccess(null), 6000);
      } else {
        alert("Failed to broadcast announcement");
      }
    } catch (err) {
      console.error(err);
      alert("Error broadcasting announcement");
    } finally {
      setBroadcasting(false);
    }
  };

  // Overdue tasks & SendGrid state
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [notifyingOverdue, setNotifyingOverdue] = useState(false);
  const [notificationAlert, setNotificationAlert] = useState<string | null>(null);

  // Nudge demo state
  const [nudgeLog, setNudgeLog] = useState<any[]>([]);
  const [triggeringNudge, setTriggeringNudge] = useState(false);

  useEffect(() => {
    loadData();
  }, [token, activeTab]);

  const loadData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      if (activeTab === "joiners") {
        const j = await api.getNewJoiners(token);
        setJoiners(j);
      } else if (activeTab === "escalations") {
        const esc = await api.getEscalations(token);
        setEscalations(esc);
      } else if (activeTab === "templates") {
        const t = await api.getTemplates(token);
        setTemplates(t);
      } else if (activeTab === "nudges") {
        const ov = await api.getOverdueTasks(token);
        setOverdueTasks(ov);
      } else if (activeTab === "documents") {
        const d = await api.getDocuments(token);
        setDocuments(d);
      } else if (activeTab === "questions") {
        const q = await api.getCommonQuestions(token);
        setCommonQuestions(q);
      } else if (activeTab === "calls") {
        const [calls, linesData] = await Promise.all([
          api.getCallHistory(token),
          api.getAgentLines(token)
        ]);
        setCallRequests(calls);
        setAgentLines(linesData.all_lines);
      }

      const stats = await api.getSystemStats(token);
      setSystemStats(stats);
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenJoinerDetail = async (joiner: any) => {
    setSelectedJoiner(joiner);
    setLoadingJoinerTasks(true);
    try {
      const tasks = await api.getJoinerTasks(token, joiner.id);
      setSelectedJoinerTasks(tasks);
    } catch (err) {
      console.error("Failed to load joiner tasks", err);
    } finally {
      setLoadingJoinerTasks(false);
    }
  };

  const handleCreateJoiner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJoinerData.email.trim() || !newJoinerData.full_name.trim()) return;
    setAddingJoiner(true);
    try {
      await api.createJoiner(token, newJoinerData);
      setShowAddJoinerModal(false);
      setNewJoinerData({
        full_name: "",
        email: "",
        role: "Backend Developer",
        department: "Engineering",
        location: "Redmond, WA",
        phone_number: "+1 425 555 0199",
        password: "Password123!"
      });
      await loadData();
      onRefreshStats?.();
      alert("✅ Employee successfully added! Role-specific onboarding checklist generated.");
    } catch (err: any) {
      alert(`❌ ${err.message || "Failed to add employee"}`);
    } finally {
      setAddingJoiner(false);
    }
  };

  const handleUploadDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    setDocUploadError(null);
    setUploadingDoc(true);

    try {
      if (docUploadMode === "file") {
        if (!selectedDocFile) {
          setDocUploadError("Please select a file to upload (.docx, .pdf, .md, .txt)");
          setUploadingDoc(false);
          return;
        }
        await api.uploadDocumentFile(
          token,
          selectedDocFile,
          newDocData.category,
          newDocData.title.trim() || undefined
        );
      } else {
        if (!newDocData.title.trim() || !newDocData.content.trim()) {
          setDocUploadError("Please provide both a title and document content.");
          setUploadingDoc(false);
          return;
        }
        await api.uploadDocument(token, {
          title: newDocData.title,
          category: newDocData.category,
          source_file: newDocData.source_file || `${newDocData.title.toLowerCase().replace(/\s+/g, "_")}.md`,
          content: newDocData.content
        });
      }

      setShowUploadDocModal(false);
      setSelectedDocFile(null);
      setDocUploadError(null);
      setNewDocData({
        title: "",
        category: "HR",
        source_file: "",
        content: ""
      });
      await loadData();
      onRefreshStats?.();
      alert("✅ Document successfully indexed into the organization knowledge base! Chunks and embeddings are permanently persisted.");
    } catch (err: any) {
      const errMsg = err.message || "Failed to upload document";
      if (errMsg.includes("already been uploaded and processed")) {
        setDocUploadError("This document has already been uploaded and processed.");
      } else {
        setDocUploadError(errMsg);
      }
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document from the vector store?")) return;
    try {
      await api.deleteDocument(token, id);
      await loadData();
      onRefreshStats?.();
    } catch (err) {
      alert("Failed to delete document");
    }
  };

  const handleAssignTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTaskData.title.trim()) {
      alert("Please enter a task title");
      return;
    }
    setAssigningTask(true);
    try {
      await api.assignTask(token, {
        target_type: assignTaskData.target_type,
        user_id: assignTaskData.target_type === "individual" ? assignTaskData.user_id : undefined,
        target_role: assignTaskData.target_type === "role" ? assignTaskData.target_role : undefined,
        target_department: assignTaskData.target_type === "department" ? assignTaskData.target_department : undefined,
        target_location: assignTaskData.target_type === "location" ? assignTaskData.target_location : undefined,
        title: assignTaskData.title,
        description: assignTaskData.description,
        category: assignTaskData.category,
        priority: assignTaskData.priority,
        due_date: assignTaskData.due_date ? new Date(assignTaskData.due_date).toISOString() : undefined,
        mandatory: assignTaskData.mandatory,
        reference_doc: assignTaskData.reference_doc.trim() || undefined,
        send_sms_notification: assignTaskData.send_sms_notification,
        send_email_notification: assignTaskData.send_email_notification
      });
      setShowAssignModal(false);
      setAssignTaskData({
        target_type: "individual",
        user_id: "",
        target_role: "Backend Engineer",
        target_department: "Engineering",
        target_location: "Redmond, WA",
        title: "",
        description: "",
        category: "IT",
        priority: "high",
        due_date: "",
        mandatory: true,
        reference_doc: "",
        send_sms_notification: true,
        send_email_notification: true
      });
      await loadData();
      if (selectedJoiner) {
        handleOpenJoinerDetail(selectedJoiner);
      }
      onRefreshStats?.();
      alert("✅ Custom task successfully assigned to targeted employee(s)!");
    } catch (err: any) {
      alert(err.message || "Failed to assign task");
    } finally {
      setAssigningTask(false);
    }
  };

  const handleAdminUpdateTaskStatus = async (taskId: string, newStatus: string) => {
    try {
      setSelectedJoinerTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: newStatus as any } : t))
      );
      await api.updateAdminTaskStatus(token, taskId, newStatus);
      await loadData();
      onRefreshStats?.();
    } catch (err: any) {
      alert(err.message || "Failed to update task status");
      if (selectedJoiner) {
        handleOpenJoinerDetail(selectedJoiner);
      }
    }
  };

  const handleNotifyOverdue = async (taskId?: string) => {
    setNotifyingOverdue(true);
    setNotificationAlert(null);
    try {
      const res = await api.notifyDeadlineOverdue(token, taskId);
      setNotificationAlert(`✅ ${res.message || "Notification sent!"} (${res.count ?? 0} dispatched via SendGrid / Microsoft ID)`);
      const ov = await api.getOverdueTasks(token);
      setOverdueTasks(ov);
      onRefreshStats?.();
    } catch (err: any) {
      setNotificationAlert(`❌ Notification failed: ${err.message || "Error"}`);
    } finally {
      setNotifyingOverdue(false);
    }
  };

  const handleResolveEscalation = async () => {
    if (!selectedEscalation) return;
    setResolving(true);
    try {
      await api.resolveEscalation(
        token,
        selectedEscalation.id,
        resolutionNotes || "HR Partner resolved following direct outreach.",
        "Maanvi (HR Director)"
      );
      setSelectedEscalation(null);
      setResolutionNotes("");
      await loadData();
      onRefreshStats?.();
    } catch (err) {
      alert("Failed to resolve escalation");
    } finally {
      setResolving(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.title.trim()) return;
    try {
      await api.createTemplate(token, newTemplate);
      setShowTemplateModal(false);
      setNewTemplate({
        title: "",
        description: "",
        role: "Backend Developer",
        location: "All",
        category: "IT",
        due_days_from_hire: 2,
        priority: "high",
        required: true
      });
      await loadData();
    } catch (err) {
      alert("Failed to create template");
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("Are you sure you want to delete this checklist template?")) return;
    try {
      await api.deleteTemplate(token, id);
      await loadData();
    } catch (err) {
      alert("Failed to delete template");
    }
  };

  const handleTriggerNudges = async () => {
    setTriggeringNudge(true);
    try {
      const res = await api.triggerNudges(token, undefined, true);
      setNudgeLog(Array.isArray(res) ? res : [res]);
      await loadData();
      onRefreshStats?.();
    } catch (err) {
      alert("Failed to dispatch nudges");
    } finally {
      setTriggeringNudge(false);
    }
  };

  // Pre-fill sample document templates for easy testing
  const handleLoadSamplePolicy = (type: "leave" | "it" | "conduct") => {
    if (type === "leave") {
      setNewDocData({
        title: "Launch Mate Global Leave & Absence Policy 2026",
        category: "HR",
        source_file: "leave_and_absence_policy_2026.md",
        content: `# Launch Mate Global Leave & Absence Policy (2026 Edition)\n\n## Casual Leave Entitlement\nAll full-time employees receive **12 days of Casual Leave (CL)** per calendar year. Casual leaves are intended for personal emergencies, urgent family matters, or sudden unforeseen events.\n- Casual leaves are credited on Day 1 of joining.\n- Can be availed as half-day or full-day.\n- Requires informal notification to your direct manager via Microsoft Teams.\n\n## Earned & Vacation Leave\nEmployees accrue 20 days of paid vacation per year.\n\n## Sick Leave\n10 days of paid sick leave annually.`
      });
    } else if (type === "it") {
      setNewDocData({
        title: "Backend Engineering Security & Cloud Guidelines",
        category: "IT",
        source_file: "backend_engineering_guidelines.md",
        content: `# Backend Engineering Onboarding & Security Guidelines\n\n## Azure Subscription & AKS Access\nBackend Developers must authenticate via Microsoft Entra ID (formerly Azure AD).\n- Cloud environment: Azure Kubernetes Service (AKS) in westus3.\n- Database: Azure Database for PostgreSQL Flexible Server.\n- Local tools: Docker, dev containers, and Azure CLI (\`az login\`).`
      });
    } else {
      setNewDocData({
        title: "Launch Mate Standards of Business Conduct & Ethics",
        category: "Legal",
        source_file: "standards_of_business_conduct.md",
        content: `# Standards of Business Conduct\n\n## Workplace Integrity\nLaunch Mate maintains a strict zero-tolerance policy towards harassment, discrimination, or retaliation.\n\n## Confidential Reporting\nEmployees may report any ethical concerns to \`ethics@launchmate.com\` or anonymously via the HR Hotline.`
      });
    }
  };

  // Calculate Overview metrics
  const totalJoiners = joiners.length;
  const inProgressJoiners = joiners.filter((j) => (j.stats?.completion_percentage || 0) < 100 && (j.stats?.completion_percentage || 0) > 0).length;
  const completedJoiners = joiners.filter((j) => (j.stats?.completion_percentage || 0) >= 100).length;
  const needsAttentionJoiners = joiners.filter((j) => (j.stats?.overdue_tasks || 0) > 0).length;

  return (
    <div className="space-y-6">
      {/* 4 Standard HR Overview Cards: Total, In Progress, Completed, Needs Attention */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total New Joiners</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-slate-900">{totalJoiners}</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Users className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Enrolled in onboarding</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">In Progress</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-blue-600">{inProgressJoiners || totalJoiners - completedJoiners}</span>
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Actively completing tasks</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Completed</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-emerald-600">{completedJoiners}</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <CheckCircle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">100% onboarding milestone reached</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Needs Attention</span>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${needsAttentionJoiners > 0 || (systemStats?.open_escalations || 0) > 0 ? "text-amber-600" : "text-slate-500"}`}>
              {needsAttentionJoiners + (systemStats?.open_escalations || 0)}
            </span>
            <div className={`p-2 rounded-xl ${needsAttentionJoiners > 0 || (systemStats?.open_escalations || 0) > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-50 text-slate-400"}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Overdue tasks & open tickets</p>
        </div>
      </div>

      {/* HR Command Center: Direct Working Access to Jira Software, Cohort Chat & SendGrid Announcement Broadcast */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div 
          onClick={() => onSwitchTab?.("jira")}
          className="bg-gradient-to-r from-indigo-900/95 via-indigo-800 to-indigo-900 text-white p-5 rounded-2xl border border-indigo-500/30 shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <Layers className="w-5 h-5 text-indigo-300" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Workspace & Task Hub</h4>
                <p className="text-[11px] text-indigo-200/80">Plan • Track • Release • Support</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-indigo-100/70 mt-3 leading-relaxed">
            Manage project sprints, estimate story points, review release readiness, and resolve service desk tickets.
          </p>
        </div>

        <div 
          onClick={() => onSwitchTab?.("chat")}
          className="bg-gradient-to-r from-purple-900/95 via-purple-800 to-purple-900 text-white p-5 rounded-2xl border border-purple-500/30 shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <MessageSquare className="w-5 h-5 text-purple-300" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Cohort Chat & Teams</h4>
                <p className="text-[11px] text-purple-200/80">Channels, DMs & Video Calls</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
          </div>
          <p className="text-xs text-purple-100/70 mt-3 leading-relaxed">
            Engage with new hires across #general, schedule Microsoft Teams meetings, and direct message employees.
          </p>
        </div>

        <div 
          onClick={() => setShowBroadcastModal(true)}
          className="bg-gradient-to-r from-blue-900/95 via-blue-800 to-indigo-900 text-white p-5 rounded-2xl border border-blue-500/30 shadow-lg cursor-pointer hover:scale-[1.01] active:scale-[0.99] transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-white/10 rounded-xl">
                <Megaphone className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">Broadcast Announcement</h4>
                <p className="text-[11px] text-blue-200/80">SendGrid Email & Chat Push</p>
              </div>
            </div>
            <Plus className="w-4 h-4 text-white/50 group-hover:text-white transition-all" />
          </div>
          <p className="text-xs text-blue-100/70 mt-3 leading-relaxed">
            Post an official announcement that alerts all employees in chat and automatically sends SendGrid emails to their inboxes.
          </p>
        </div>
      </div>

      {broadcastSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-semibold flex items-center gap-2 animate-fadeIn shadow-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{broadcastSuccess}</span>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-2xl px-4 pt-2 overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab("joiners")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "joiners"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" /> New Joiners & Progress
        </button>

        <button
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "templates"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ListTodo className="w-4 h-4" /> Onboarding Workflows
        </button>

        <button
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "documents"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="w-4 h-4" /> Company Documents (RAG)
        </button>

        <button
          onClick={() => setActiveTab("nudges")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "nudges"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Bell className="w-4 h-4" /> Delayed & Pending Tasks
        </button>

        <button
          onClick={() => setActiveTab("escalations")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap relative ${
            activeTab === "escalations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-500" /> Escalations Queue
          {systemStats?.open_escalations > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-500 text-white rounded-full">
              {systemStats.open_escalations}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("questions")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "questions"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <HelpCircle className="w-4 h-4 text-indigo-600" /> Common Questions
        </button>

        <button
          onClick={() => setActiveTab("calls")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all whitespace-nowrap ${
            activeTab === "calls"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <PhoneCall className="w-4 h-4 text-emerald-600" /> Live Agent Lines
        </button>
      </div>

      {/* Tab 1: New Joiners Roster & Individual Inspection */}
      {activeTab === "joiners" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">New Joiner Management & Monitoring</h3>
              <p className="text-xs text-slate-500">View real-time onboarding progress, inspect individual checklists, or provision employees</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowAddJoinerModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
              >
                <UserPlus className="w-3.5 h-3.5" /> Add New Employee
              </button>
              <button
                onClick={() => {
                  setAssignTaskData({
                    target_type: "all",
                    user_id: "",
                    target_role: "Backend Engineer",
                    target_department: "Engineering",
                    target_location: "Redmond, WA",
                    title: "",
                    description: "",
                    category: "IT",
                    priority: "high",
                    due_date: "",
                    mandatory: true,
                    reference_doc: "",
                    send_sms_notification: true,
                    send_email_notification: true
                  });
                  setShowAssignModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Assign Custom Task
              </button>
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Sync
              </button>
            </div>
          </div>

          {/* Joiner Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {joiners.map((j) => (
              <div
                key={j.id}
                className="p-5 rounded-2xl border border-slate-200 hover:border-blue-300 transition-all bg-slate-50/50 flex flex-col justify-between hover:shadow-xs"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                        {j.full_name}
                      </h4>
                      <p className="text-xs font-medium text-blue-600">{j.role}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">📍 {j.location} • {j.department}</p>
                      <p className="text-[10px] font-mono text-slate-400 mt-0.5">{j.email}</p>
                    </div>
                    <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                      {j.stats?.completion_percentage || 0}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-4">
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${j.stats?.completion_percentage || 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                      <span className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3 h-3" /> {j.stats?.completed_tasks || 0} done
                      </span>
                      <span className="flex items-center gap-1 text-amber-600 font-medium">
                        <Clock className="w-3 h-3" /> {j.stats?.pending_tasks || 0} pending
                      </span>
                      {j.stats?.overdue_tasks > 0 && (
                        <span className="text-red-600 font-bold flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {j.stats.overdue_tasks} overdue
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200 flex items-center justify-between">
                  <button
                    onClick={() => handleOpenJoinerDetail(j)}
                    className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800"
                  >
                    View Checklist <ChevronRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => {
                      setAssignTaskData({
                        target_type: "individual",
                        user_id: j.id,
                        target_role: "Backend Engineer",
                        target_department: "Engineering",
                        target_location: "Redmond, WA",
                        title: "",
                        description: "",
                        category: "IT",
                        priority: "high",
                        due_date: "",
                        mandatory: true,
                        reference_doc: "",
                        send_sms_notification: true,
                        send_email_notification: true
                      });
                      setShowAssignModal(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-2xs"
                  >
                    <Plus className="w-3 h-3" /> Assign Task
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Onboarding Workflows & Templates */}
      {activeTab === "templates" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Role-Specific Onboarding Workflows</h3>
              <p className="text-xs text-slate-500">
                Define automated onboarding checklists mapped to specific roles (e.g. Backend Developer) and locations
              </p>
            </div>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" /> Define New Workflow Task
            </button>
          </div>

          {/* Template Type Filter Chips */}
          <div className="flex gap-1.5 flex-wrap">
            {["All", "Base", "Role", "Location"].map((f) => (
              <button
                key={f}
                onClick={() => setTemplateFilter(f.toLowerCase())}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all ${
                  templateFilter === f.toLowerCase()
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f === "All" ? "📋 All" : f === "Base" ? "🌐 Base" : f === "Role" ? "💼 Role" : "📍 Location"} ({
                  f === "All"
                    ? templates.length
                    : templates.filter((t) => (t.template_type || "base") === f.toLowerCase()).length
                })
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates
              .filter((t) =>
                templateFilter === "all" ? true : (t.template_type || "base") === templateFilter
              )
              .map((t) => (
              <div key={t.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between hover:border-slate-300 transition-colors">
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700">
                        {t.category}
                      </span>
                      {/* Template Type Badge */}
                      {(!t.template_type || t.template_type === "base") && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-600">🌐 Base</span>
                      )}
                      {t.template_type === "role" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-indigo-50 text-indigo-700">💼 Role</span>
                      )}
                      {t.template_type === "location" && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-700">📍 Location</span>
                      )}
                      {t.mandatory !== false && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-rose-50 text-rose-700">Required</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteTemplate(t.id)}
                      className="text-slate-400 hover:text-red-600 transition-colors p-1"
                      title="Delete template task"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm mt-2">{t.title}</h4>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">{t.description}</p>
                  {t.reference_doc && (
                    <p className="text-[10px] text-blue-600 mt-1 font-medium">📄 {t.reference_doc}</p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">Target: {t.role} · {t.location || "All"}</span>
                  <span>Due in {t.due_days_from_hire}d</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 3: Company Documents (RAG Knowledge Ingestion) */}
      {activeTab === "documents" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Corporate Knowledge Base & Policies</h3>
              <p className="text-xs text-slate-500">
                Persistent one-time RAG ingestion pipeline: Upload DOCX, PDF, or Markdown documents to index company knowledge
              </p>
            </div>
            <button
              onClick={() => {
                setDocUploadError(null);
                setShowUploadDocModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95"
            >
              <Upload className="w-3.5 h-3.5" /> Upload & Ingest Document
            </button>
          </div>

          {/* Architecture Banner */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3 text-xs text-slate-600">
            <Sparkles className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-slate-900">One-Time Ingestion Architecture: </span>
              Uploaded documents are validated, chunked, embedded, and permanently indexed in the organization repository.
              Deduplication prevents re-embedding, and all new joinees query this verified knowledge base with source citations.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.length === 0 ? (
              <div className="col-span-2 py-10 text-center text-slate-400 text-xs">
                No documents uploaded yet. Click &quot;Upload &amp; Ingest Document&quot; to populate your organization&apos;s knowledge base.
              </div>
            ) : (
              documents.map((doc) => {
                const statusColor =
                  doc.status === "Successfully Indexed"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : doc.status === "Processing"
                    ? "bg-blue-50 text-blue-700 border-blue-200 animate-pulse"
                    : doc.status === "Duplicate"
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-red-50 text-red-700 border-red-200";

                return (
                  <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700">
                            {doc.category}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded border ${statusColor}`}>
                            ● {doc.status || "Successfully Indexed"}
                          </span>
                          {doc.organization_id && (
                            <span className="px-1.5 py-0.5 text-[10px] font-mono text-slate-500 bg-white border border-slate-200 rounded">
                              🏢 {doc.organization_id}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="text-slate-400 hover:text-red-600 p-1 rounded hover:bg-slate-100 transition-colors"
                            title="Delete document"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <h4 className="font-bold text-slate-900 text-sm mt-2">{doc.title}</h4>
                      <p className="text-[11px] font-mono text-slate-500 mt-0.5 truncate">{doc.source_file}</p>
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                          ⚡ {doc.chunk_count || 1} chunks
                        </span>
                        {doc.content_hash && (
                          <span className="text-[10px] font-mono text-slate-400" title={`SHA-256: ${doc.content_hash}`}>
                            #{doc.content_hash.slice(0, 8)}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Delayed & Pending Tasks */}
      {activeTab === "nudges" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Delayed & Pending Tasks</h3>
              <p className="text-xs text-slate-500">
                Automated deadline monitoring with SendGrid email nudges and Microsoft Teams alerts
              </p>
            </div>
            <button
              onClick={() => handleNotifyOverdue()}
              disabled={notifyingOverdue}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {notifyingOverdue ? "Dispatching..." : "Notify All Overdue Employees"}
            </button>
          </div>

          {notificationAlert && (
            <div className="p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-xl text-xs font-medium">
              {notificationAlert}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Task Title</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Assigned Employee</th>
                  <th className="py-2.5 px-3">Due Date</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdueTasks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No overdue tasks found. All employees are on schedule!
                    </td>
                  </tr>
                ) : (
                  overdueTasks.map((t) => (
                    <tr key={t.task_id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3 font-semibold text-slate-800">{t.title}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-800">{t.employee_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{t.employee_email}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-600">
                        {t.due_date ? new Date(t.due_date).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${t.is_overdue ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                          {t.is_overdue ? "OVERDUE" : "PENDING"}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleNotifyOverdue(t.task_id)}
                          className="px-2.5 py-1 text-xs font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          Send Nudge
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 5: Escalations Queue */}
      {activeTab === "escalations" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Escalated Queries & HR Triage</h3>
              <p className="text-xs text-slate-500">
                Queries flagged by sensitivity guardrails, low-confidence RAG, or reported directly by employees
              </p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 rounded-xl"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {escalations.length === 0 ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No open escalations in the queue.
              </div>
            ) : (
              escalations.map((esc) => (
                <div key={esc.id} className="py-4 flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        esc.priority === "urgent" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        {esc.priority.toUpperCase()}
                      </span>
                      <span className="text-xs font-bold text-slate-900">{esc.reason}</span>
                    </div>
                    <p className="text-xs text-slate-600">{esc.summary}</p>
                    <p className="text-[11px] text-slate-400">
                      From: <strong>{esc.user_name}</strong> ({esc.user_email}) • {new Date(esc.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {esc.status === "open" ? (
                      <button
                        onClick={() => setSelectedEscalation(esc)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs"
                      >
                        Inspect & Resolve
                      </button>
                    ) : (
                      <span className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 rounded-lg">
                        Resolved
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 6: Common Employee Questions */}
      {activeTab === "questions" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 text-base">Common Employee Questions & Inquiry Trends</h3>
            <p className="text-xs text-slate-500">
              Aggregated analytics across employee AI interactions to identify policy ambiguities or frequent onboarding roadblocks
            </p>
          </div>

          {/* Question Topic Frequency Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {commonQuestions?.top_topics?.map((item: any, idx: number) => (
              <div key={idx} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
                <span className="text-xs font-semibold text-slate-700">{item.topic}</span>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-2xl font-bold text-blue-600">{item.count}</span>
                  <MessageSquare className="w-4 h-4 text-slate-400" />
                </div>
                <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                  <div
                    className="bg-blue-600 h-1.5 rounded-full"
                    style={{ width: `${Math.min(100, item.count * 20)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Recent Queries Feed */}
          <div>
            <h4 className="font-bold text-slate-800 text-sm mb-3">Recent Employee Inquiries</h4>
            <div className="space-y-2">
              {commonQuestions?.recent_employee_queries?.length > 0 ? (
                commonQuestions.recent_employee_queries.map((q: any, i: number) => (
                  <div key={i} className="p-3 rounded-xl border border-slate-200 bg-white flex items-center justify-between text-xs">
                    <span className="text-slate-800 font-medium">{q.content}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      {new Date(q.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400">No employee questions recorded yet.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tab 7: Calls */}
      {activeTab === "calls" && (
        <div className="bg-white rounded-b-2xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Live Agent Helplines & Callback Requests</h3>
              <p className="text-xs text-slate-500">Live human voice assistance routing</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agentLines.map((line) => (
              <div key={line.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{line.agent_name}</h4>
                    <p className="text-xs text-slate-500">{line.role} • {line.department}</p>
                    <p className="text-xs font-mono font-bold text-blue-600 mt-1">{line.phone_number}</p>
                  </div>
                  <PhoneCall className="w-5 h-5 text-emerald-600" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: Add New Employee */}
      {showAddJoinerModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateJoiner}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-600" /> Add New Employee to Onboarding
              </h3>
              <button
                type="button"
                onClick={() => setShowAddJoinerModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Full Name</label>
                <input
                  type="text"
                  required
                  value={newJoinerData.full_name}
                  onChange={(e) => setNewJoinerData({ ...newJoinerData, full_name: e.target.value })}
                  placeholder="e.g., Liam Gallagher"
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Corporate Email</label>
                <input
                  type="email"
                  required
                  value={newJoinerData.email}
                  onChange={(e) => setNewJoinerData({ ...newJoinerData, email: e.target.value })}
                  placeholder="e.g., liam.g@launchmate.com"
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Assigned Role</label>
                  <select
                    value={newJoinerData.role}
                    onChange={(e) => setNewJoinerData({ ...newJoinerData, role: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                  >
                    <option value="Backend Engineer">Backend Engineer</option>
                    <option value="Software Engineer">Software Engineer</option>
                    <option value="Frontend Engineer">Frontend Engineer</option>
                    <option value="Product Manager">Product Manager</option>
                    <option value="Sales Executive">Sales Executive</option>
                    <option value="Sales Representative">Sales Representative</option>
                    <option value="HR Manager">HR Manager</option>
                    <option value="HR Business Partner">HR Business Partner</option>
                    <option value="Data Scientist">Data Scientist</option>
                    <option value="Solutions Architect">Solutions Architect</option>
                    <option value="DevOps Engineer">DevOps Engineer</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Work Location</label>
                  <select
                    value={newJoinerData.location}
                    onChange={(e) => setNewJoinerData({ ...newJoinerData, location: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                  >
                    <option value="Redmond, WA">Redmond, WA (Office)</option>
                    <option value="Delhi, India">Delhi, India (Office)</option>
                    <option value="London, UK">London, UK (Office)</option>
                    <option value="Bangalore, India">Bangalore, India (Office)</option>
                    <option value="Remote">Remote (WFH)</option>
                    <option value="Seattle, WA">Seattle, WA (Office)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700">Experience Level</label>
                  <select
                    value={newJoinerData.experience_level}
                    onChange={(e) => setNewJoinerData({ ...newJoinerData, experience_level: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                  >
                    <option value="Junior">Junior (0-2 yrs)</option>
                    <option value="Mid-Level">Mid-Level (2-5 yrs)</option>
                    <option value="Senior">Senior (5-8 yrs)</option>
                    <option value="Lead">Lead / Principal</option>
                    <option value="Executive">Executive</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700">Department</label>
                  <input
                    type="text"
                    value={newJoinerData.department}
                    onChange={(e) => setNewJoinerData({ ...newJoinerData, department: e.target.value })}
                    className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                    placeholder="e.g. Engineering, Sales, HR"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Initial Password</label>
                <input
                  type="text"
                  value={newJoinerData.password}
                  onChange={(e) => setNewJoinerData({ ...newJoinerData, password: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>

              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-[11px] text-blue-800">
                <span className="font-bold">🎯 Auto-Generation:</span> Upon adding, the system will automatically generate a <strong>personalized onboarding checklist</strong> based on the employee's role, location, and experience level.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddJoinerModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addingJoiner}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
              >
                {addingJoiner ? "Provisioning..." : "Add Employee & Generate Tasks"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Upload Company Policy / Document (RAG) */}
      {showUploadDocModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleUploadDocument}
            className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-blue-600" /> Ingest Company Document
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">One-time ingestion pipeline into the persistent organization knowledge base</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowUploadDocModal(false);
                  setDocUploadError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-100"
              >
                ✕
              </button>
            </div>

            {/* Error / Duplicate Alert Banner */}
            {docUploadError && (
              <div className="p-3.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 flex items-start gap-2.5 text-xs">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">{docUploadError}</p>
                  {docUploadError.includes("already been uploaded") && (
                    <p className="text-[11px] text-amber-700 mt-0.5">
                      Deduplication detected this exact document content in your organization. Duplicate chunks were not created.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Mode Switcher */}
            <div className="flex p-1 bg-slate-100 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => {
                  setDocUploadMode("file");
                  setDocUploadError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  docUploadMode === "file"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Upload className="w-3.5 h-3.5" /> File Upload (.docx, .pdf, .md, .txt)
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocUploadMode("text");
                  setDocUploadError(null);
                }}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                  docUploadMode === "text"
                    ? "bg-white text-blue-600 shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileText className="w-3.5 h-3.5" /> Paste Text / Markdown
              </button>
            </div>

            {docUploadMode === "file" ? (
              <div className="space-y-3">
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-5 text-center transition-colors bg-slate-50/50">
                  <input
                    type="file"
                    id="doc-file-input"
                    accept=".docx,.pdf,.md,.txt"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        const file = e.target.files[0];
                        setSelectedDocFile(file);
                        if (!newDocData.title) {
                          setNewDocData((prev) => ({
                            ...prev,
                            title: file.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ")
                          }));
                        }
                      }
                    }}
                    className="hidden"
                  />
                  <label htmlFor="doc-file-input" className="cursor-pointer flex flex-col items-center gap-2">
                    <Upload className="w-8 h-8 text-blue-500" />
                    <div>
                      <p className="text-xs font-bold text-slate-800">
                        {selectedDocFile ? selectedDocFile.name : "Click to select a document"}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {selectedDocFile
                          ? `${(selectedDocFile.size / 1024).toFixed(1)} KB • Ready for extraction & embedding`
                          : "Supports Microsoft Word (.docx), PDF (.pdf), Markdown (.md), Text (.txt)"}
                      </p>
                    </div>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Document Title</label>
                    <input
                      type="text"
                      value={newDocData.title}
                      onChange={(e) => setNewDocData({ ...newDocData, title: e.target.value })}
                      placeholder="e.g., Launch Mate Employee Handbook 2026"
                      className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700">Category</label>
                    <select
                      value={newDocData.category}
                      onChange={(e) => setNewDocData({ ...newDocData, category: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                    >
                      <option value="HR">HR Policies</option>
                      <option value="IT">IT & Security</option>
                      <option value="Benefits">Benefits & Health</option>
                      <option value="Legal">Legal & Compliance</option>
                      <option value="Handbook">Employee Handbook</option>
                    </select>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Quick Presets */}
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl">
                  <p className="text-[11px] font-bold text-blue-800 mb-1.5">⚡ Fast-Fill Sample Policies:</p>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleLoadSamplePolicy("leave")}
                      className="px-2.5 py-1 text-[11px] bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold"
                    >
                      Leave & Casual Leave Policy
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadSamplePolicy("it")}
                      className="px-2.5 py-1 text-[11px] bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold"
                    >
                      Backend Engineering & IT Guide
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadSamplePolicy("conduct")}
                      className="px-2.5 py-1 text-[11px] bg-white border border-blue-200 rounded-lg text-blue-700 hover:bg-blue-100 font-semibold"
                    >
                      Code of Conduct
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Document Title</label>
                  <input
                    type="text"
                    value={newDocData.title}
                    onChange={(e) => setNewDocData({ ...newDocData, title: e.target.value })}
                    placeholder="e.g., Launch Mate 2026 Leave & Time-Off Policy"
                    className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700">Category</label>
                    <select
                      value={newDocData.category}
                      onChange={(e) => setNewDocData({ ...newDocData, category: e.target.value })}
                      className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                    >
                      <option value="HR">HR Policies</option>
                      <option value="IT">IT & Security</option>
                      <option value="Benefits">Benefits & Health</option>
                      <option value="Legal">Legal & Compliance</option>
                      <option value="Handbook">Employee Handbook</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700">Source File Name</label>
                    <input
                      type="text"
                      value={newDocData.source_file}
                      onChange={(e) => setNewDocData({ ...newDocData, source_file: e.target.value })}
                      placeholder="e.g., leave_policy_2026.md"
                      className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700">Document Content (Markdown / Text)</label>
                  <textarea
                    rows={6}
                    value={newDocData.content}
                    onChange={(e) => setNewDocData({ ...newDocData, content: e.target.value })}
                    placeholder="Paste official company policy markdown content here..."
                    className="w-full mt-1 p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 font-mono outline-none"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowUploadDocModal(false);
                  setDocUploadError(null);
                }}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploadingDoc}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
              >
                {uploadingDoc ? "Validating & Vectorizing..." : "Ingest Document into Knowledge Base"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Individual Employee Checklist & Progress View */}
      {selectedJoiner && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">{selectedJoiner.full_name}</h3>
                <p className="text-xs text-slate-500">{selectedJoiner.role} • {selectedJoiner.location} • {selectedJoiner.email}</p>
              </div>
              <button
                onClick={() => setSelectedJoiner(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Checklist items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-600">Assigned Onboarding Checklist</h4>
                <button
                  onClick={() => {
                    setAssignTaskData({
                      target_type: "individual",
                      user_id: selectedJoiner.id,
                      target_role: selectedJoiner.role || "Backend Engineer",
                      target_department: selectedJoiner.department || "Engineering",
                      target_location: selectedJoiner.location || "Redmond, WA",
                      title: "",
                      description: "",
                      category: "IT",
                      priority: "high",
                      due_date: "",
                      mandatory: true,
                      reference_doc: "",
                      send_sms_notification: true,
                      send_email_notification: true
                    });
                    setShowAssignModal(true);
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Task
                </button>
              </div>

              {loadingJoinerTasks ? (
                <div className="py-8 text-center text-xs text-slate-400">Loading checklist tasks...</div>
              ) : selectedJoinerTasks.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">No tasks assigned yet.</div>
              ) : (
                <div className="space-y-2">
                  {selectedJoinerTasks.map((t) => (
                    <div
                      key={t.id}
                      className={`p-3 rounded-xl border flex flex-col gap-2 text-xs ${
                        t.status === "completed"
                          ? "bg-slate-50/50 border-slate-200 opacity-80"
                          : t.status === "overdue"
                          ? "bg-red-50/40 border-red-200"
                          : t.status === "in_progress"
                          ? "bg-blue-50/30 border-blue-200"
                          : "bg-white border-slate-200"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {t.status === "completed" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : t.status === "in_progress" ? (
                            <Clock className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
                          ) : (
                            <Clock className={`w-4 h-4 shrink-0 ${t.status === "overdue" ? "text-red-500" : "text-amber-500"}`} />
                          )}
                          <div className="min-w-0">
                            <p className={`font-semibold truncate ${t.status === "completed" ? "line-through text-slate-400" : "text-slate-800"}`}>
                              {t.title}
                            </p>
                            {t.due_date && (
                              <p className="text-[10px] text-slate-400">
                                Due: {new Date(t.due_date).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                          {/* Task type badge */}
                          {(!t.task_type || t.task_type === "general") && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-slate-100 text-slate-600">General</span>
                          )}
                          {t.task_type === "role_specific" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-indigo-50 text-indigo-700">Role</span>
                          )}
                          {t.task_type === "location_specific" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-emerald-50 text-emerald-700">Location</span>
                          )}
                          {t.task_type === "hr_custom" && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded-full bg-amber-50 text-amber-700">HR</span>
                          )}

                          <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-100 text-slate-600">
                            {t.category}
                          </span>
                          <span className={`px-2 py-0.5 text-[9px] font-extrabold uppercase rounded ${
                            t.status === "completed" ? "bg-emerald-100 text-emerald-800"
                            : t.status === "overdue" ? "bg-red-100 text-red-800"
                            : t.status === "in_progress" ? "bg-blue-100 text-blue-800"
                            : "bg-amber-100 text-amber-800"
                          }`}>
                            {t.status.replace("_", " ")}
                          </span>
                        </div>
                      </div>

                      {/* HR Status Action Buttons */}
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100/80">
                        {t.status === "pending" && (
                          <button
                            onClick={() => handleAdminUpdateTaskStatus(t.id, "in_progress")}
                            className="px-2 py-0.5 text-[10px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg flex items-center gap-1 transition-all"
                          >
                            ▶ Mark In Progress
                          </button>
                        )}
                        {t.status === "in_progress" && (
                          <button
                            onClick={() => handleAdminUpdateTaskStatus(t.id, "completed")}
                            className="px-2 py-0.5 text-[10px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg flex items-center gap-1 transition-all"
                          >
                            ✓ Mark Complete
                          </button>
                        )}
                        {t.status === "completed" && (
                          <button
                            onClick={() => handleAdminUpdateTaskStatus(t.id, "pending")}
                            className="px-2 py-0.5 text-[10px] text-slate-400 hover:text-slate-600 transition-colors"
                          >
                            Reopen
                          </button>
                        )}
                        {t.status === "overdue" && (
                          <button
                            onClick={() => handleAdminUpdateTaskStatus(t.id, "in_progress")}
                            className="px-2 py-0.5 text-[10px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-all"
                          >
                            ↩ Reactivate
                          </button>
                        )}
                        {t.mandatory !== false && (
                          <span className="ml-auto text-[9px] font-bold text-rose-600 uppercase tracking-wide">Mandatory</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setSelectedJoiner(null)}
                className="px-4 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Assign Custom Task */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleAssignTask}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[92vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Plus className="w-5 h-5 text-blue-600" /> Assign Custom HR Task
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">Assign to individual employees, a role, department, location, or all</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            {/* Target Type Selector */}
            <div>
              <label className="text-xs font-bold text-slate-700">Assign To</label>
              <div className="flex gap-1.5 mt-1 flex-wrap">
                {(["individual", "role", "department", "location", "all"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setAssignTaskData({ ...assignTaskData, target_type: type })}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg transition-all capitalize ${
                      assignTaskData.target_type === type
                        ? "bg-blue-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {type === "all" ? "🌟 All Employees" : type === "individual" ? "👤 Individual" : type === "role" ? "💼 By Role" : type === "department" ? "🏢 Department" : "📍 Location"}
                  </button>
                ))}
              </div>
            </div>

            {/* Conditional Target Field */}
            {assignTaskData.target_type === "individual" && (
              <div>
                <label className="text-xs font-bold text-slate-700">Select Employee</label>
                <select
                  value={assignTaskData.user_id}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, user_id: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="">— Select an employee —</option>
                  {joiners.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.full_name} ({j.role} • {j.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {assignTaskData.target_type === "role" && (
              <div>
                <label className="text-xs font-bold text-slate-700">Target Role</label>
                <select
                  value={assignTaskData.target_role}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, target_role: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="Backend Engineer">Backend Engineer</option>
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Frontend Engineer">Frontend Engineer</option>
                  <option value="Sales Executive">Sales Executive</option>
                  <option value="Sales Representative">Sales Representative</option>
                  <option value="HR Manager">HR Manager</option>
                  <option value="HR Business Partner">HR Business Partner</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Data Scientist">Data Scientist</option>
                  <option value="DevOps Engineer">DevOps Engineer</option>
                </select>
              </div>
            )}

            {assignTaskData.target_type === "department" && (
              <div>
                <label className="text-xs font-bold text-slate-700">Target Department</label>
                <input
                  type="text"
                  value={assignTaskData.target_department}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, target_department: e.target.value })}
                  placeholder="e.g. Engineering, Sales, HR"
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>
            )}

            {assignTaskData.target_type === "location" && (
              <div>
                <label className="text-xs font-bold text-slate-700">Target Location</label>
                <select
                  value={assignTaskData.target_location}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, target_location: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="Redmond, WA">Redmond, WA</option>
                  <option value="Delhi, India">Delhi, India</option>
                  <option value="London, UK">London, UK</option>
                  <option value="Bangalore, India">Bangalore, India</option>
                  <option value="Remote">Remote (WFH)</option>
                </select>
              </div>
            )}

            {assignTaskData.target_type === "all" && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800 font-medium">
                ⚠️ This task will be assigned to <strong>all active employees</strong> in the organization. Verify before submitting.
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700">Task Title</label>
              <input
                type="text"
                required
                value={assignTaskData.title}
                onChange={(e) => setAssignTaskData({ ...assignTaskData, title: e.target.value })}
                placeholder="e.g., Complete Azure Security Compliance Review"
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Description</label>
              <textarea
                value={assignTaskData.description}
                onChange={(e) => setAssignTaskData({ ...assignTaskData, description: e.target.value })}
                rows={2}
                placeholder="Explain what the employee needs to do..."
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Category</label>
                <select
                  value={assignTaskData.category}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, category: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="IT">IT</option>
                  <option value="HR">HR</option>
                  <option value="Training">Training</option>
                  <option value="Legal">Legal</option>
                  <option value="Team">Team</option>
                  <option value="General">General</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700">Priority</label>
                <select
                  value={assignTaskData.priority}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, priority: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Deadline (Date & Time)</label>
              <input
                type="datetime-local"
                value={assignTaskData.due_date}
                onChange={(e) => setAssignTaskData({ ...assignTaskData, due_date: e.target.value })}
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Reference Document (optional)</label>
              <input
                type="text"
                value={assignTaskData.reference_doc}
                onChange={(e) => setAssignTaskData({ ...assignTaskData, reference_doc: e.target.value })}
                placeholder="e.g., Launch Mate Leave Policy 2026"
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="mandatory-check"
                  checked={assignTaskData.mandatory}
                  onChange={(e) => setAssignTaskData({ ...assignTaskData, mandatory: e.target.checked })}
                  className="w-3.5 h-3.5 accent-rose-600"
                />
                <label htmlFor="mandatory-check" className="text-xs font-semibold text-slate-700">Mandatory Task</label>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={assignTaskData.send_email_notification}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, send_email_notification: e.target.checked })}
                    className="w-3 h-3 accent-blue-600"
                  />
                  Email
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={assignTaskData.send_sms_notification}
                    onChange={(e) => setAssignTaskData({ ...assignTaskData, send_sms_notification: e.target.checked })}
                    className="w-3 h-3 accent-blue-600"
                  />
                  SMS
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={assigningTask}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-50"
              >
                {assigningTask ? "Assigning..." : "✓ Assign Task"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create Template Workflow */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateTemplate}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">New Role Onboarding Workflow Task</h3>
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Task Title</label>
              <input
                type="text"
                required
                value={newTemplate.title}
                onChange={(e) => setNewTemplate({ ...newTemplate, title: e.target.value })}
                placeholder="e.g., Set up Local Kubernetes & Docker Environment"
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Description</label>
              <textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Guidance for the new joiner..."
                rows={2}
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Target Role</label>
                <select
                  value={newTemplate.role}
                  onChange={(e) => setNewTemplate({ ...newTemplate, role: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="All">All Roles</option>
                  <option value="Backend Developer">Backend Developer</option>
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Product Manager">Product Manager</option>
                  <option value="Data Scientist">Data Scientist</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Target Location</label>
                <select
                  value={newTemplate.location}
                  onChange={(e) => setNewTemplate({ ...newTemplate, location: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="All">All Locations</option>
                  <option value="Redmond, WA">Redmond, WA</option>
                  <option value="London, UK">London, UK</option>
                  <option value="Bangalore, India">Bangalore, India</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700">Category</label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate({ ...newTemplate, category: e.target.value })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                >
                  <option value="IT">IT</option>
                  <option value="HR">HR</option>
                  <option value="Training">Training</option>
                  <option value="Legal">Legal</option>
                  <option value="Team">Team</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Due Days From Hire</label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={newTemplate.due_days_from_hire}
                  onChange={(e) => setNewTemplate({ ...newTemplate, due_days_from_hire: parseInt(e.target.value) || 1 })}
                  className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
              >
                Add Workflow Task
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Resolve Escalation */}
      {selectedEscalation && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <span className="text-xs font-mono text-slate-400">#ESC-{selectedEscalation.id.slice(0, 6).toUpperCase()}</span>
                <h3 className="font-bold text-slate-900 text-base">{selectedEscalation.reason}</h3>
              </div>
              <button
                onClick={() => setSelectedEscalation(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Employee Context</label>
              <p className="text-xs text-slate-800 mt-1 font-medium">
                {selectedEscalation.user_name} ({selectedEscalation.user_email})
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolution Notes</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter actions taken, HR outreach details, or resolution status..."
                rows={3}
                className="w-full mt-1.5 p-3 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setSelectedEscalation(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveEscalation}
                disabled={resolving}
                className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs"
              >
                {resolving ? "Resolving..." : "Mark as Resolved"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Broadcast Company Announcement & SendGrid Email Modal */}
      {showBroadcastModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-white rounded-3xl p-6 w-full max-w-lg shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Broadcast Company Announcement</h3>
                  <p className="text-[11px] text-slate-500">Delivers to Cohort Chat & Sends SendGrid Emails</p>
                </div>
              </div>
              <button onClick={() => setShowBroadcastModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBroadcastAnnouncement} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Announcement Headline *</label>
                <input
                  type="text"
                  required
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="e.g. Q4 All-Hands Meeting & Health Insurance Enrollment Deadline"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">Message Body *</label>
                <textarea
                  rows={4}
                  required
                  value={announcementBody}
                  onChange={(e) => setAnnouncementBody(e.target.value)}
                  placeholder="Enter the official details, timeline, key links, and action items for all team members..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:bg-white leading-relaxed"
                />
              </div>

              <div className="p-3 bg-indigo-50/80 border border-indigo-100 rounded-xl space-y-1.5 text-[11px] text-indigo-950">
                <div className="font-semibold flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Automated Distribution Channels:</span>
                </div>
                <ul className="pl-4 list-disc space-y-0.5 text-indigo-900/80">
                  <li>Publishes to <strong>#announcements</strong> Cohort Chat channel for all employees</li>
                  <li>Dispatches formatted HTML email to all registered employee email IDs via <strong>SendGrid</strong></li>
                </ul>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBroadcastModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={broadcasting}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{broadcasting ? "Broadcasting..." : "Broadcast to Everyone"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
