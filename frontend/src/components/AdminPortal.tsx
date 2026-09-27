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
  Plus,
  Trash2,
  Send,
  RefreshCw,
  ExternalLink,
  MessageSquare
} from "lucide-react";
import {
  api,
  Escalation,
  ChecklistTemplate,
  DocumentItem
} from "../lib/api";

interface AdminPortalProps {
  token: string;
  onRefreshStats?: () => void;
}

export default function AdminPortal({ token, onRefreshStats }: AdminPortalProps) {
  const [activeTab, setActiveTab] = useState<"joiners" | "escalations" | "templates" | "nudges" | "documents">("joiners");
  
  // State
  const [joiners, setJoiners] = useState<any[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [systemStats, setSystemStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Resolution modal state
  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [resolving, setResolving] = useState(false);

  // New template modal state
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    title: "",
    description: "",
    role: "All",
    location: "All",
    category: "General",
    due_days_from_hire: 3,
    priority: "medium",
    required: true
  });

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
      } else if (activeTab === "documents") {
        const d = await api.getDocuments(token);
        setDocuments(d);
      }

      const stats = await api.getSystemStats(token);
      setSystemStats(stats);
    } catch (err) {
      console.error("Failed to load admin data", err);
    } finally {
      setLoading(false);
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
        "Elena Rostova (HR Director)"
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
        role: "All",
        location: "All",
        category: "General",
        due_days_from_hire: 3,
        priority: "medium",
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

  return (
    <div className="space-y-6">
      {/* Top Telemetry KPI Bar */}
      {systemStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">New Joiners Enrolled</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-bold text-slate-900">{systemStats.total_new_joiners}</span>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Overall Checklist Progress</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-bold text-emerald-600">{systemStats.overall_completion_rate}%</span>
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">Open Human Escalations</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-bold text-amber-600">{systemStats.open_escalations}</span>
              <ShieldAlert className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-xs text-slate-500 font-medium">RAG Indexed Documents</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-2xl font-bold text-indigo-600">{systemStats.indexed_documents}</span>
              <BookOpen className="w-5 h-5 text-indigo-600" />
            </div>
          </div>
        </div>
      )}

      {/* Admin Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-2">
        <button
          onClick={() => setActiveTab("joiners")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === "joiners"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Users className="w-4 h-4" /> New Joiners Roster
        </button>
        <button
          onClick={() => setActiveTab("escalations")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all relative ${
            activeTab === "escalations"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ShieldAlert className="w-4 h-4 text-amber-500" /> Escalation Queue
          {systemStats?.open_escalations > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full">
              {systemStats.open_escalations}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === "templates"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <ListTodo className="w-4 h-4" /> Checklist Templates
        </button>
        <button
          onClick={() => setActiveTab("nudges")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === "nudges"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Bell className="w-4 h-4" /> Proactive Nudges
        </button>
        <button
          onClick={() => setActiveTab("documents")}
          className={`flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold border-b-2 transition-all ${
            activeTab === "documents"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <BookOpen className="w-4 h-4" /> Grounding Documents
        </button>
      </div>

      {/* Tab 1: New Joiners Roster */}
      {activeTab === "joiners" && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">New Joiner Cohort</h3>
              <p className="text-xs text-slate-500">Track real-time onboarding milestones by role and location</p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {joiners.map((j) => (
              <div key={j.id} className="p-4 rounded-xl border border-slate-200 hover:border-blue-300 transition-all bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm">{j.full_name}</h4>
                    <p className="text-xs text-slate-600">{j.role}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">📍 {j.location} • {j.department}</p>
                  </div>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 text-blue-700">
                    {j.stats.completion_percentage}% Done
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="mt-4">
                  <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${j.stats.completion_percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                    <span>{j.stats.completed_tasks} completed</span>
                    <span>{j.stats.pending_tasks} pending</span>
                    {j.stats.overdue_tasks > 0 && (
                      <span className="text-amber-600 font-bold">{j.stats.overdue_tasks} overdue</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Escalations Queue */}
      {activeTab === "escalations" && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Human Escalations & HR Triage</h3>
              <p className="text-xs text-slate-500">
                High-confidence handoffs triggered by sensitivity guardrails or low-confidence routing
              </p>
            </div>
            <button
              onClick={loadData}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh Queue
            </button>
          </div>

          <div className="space-y-3">
            {escalations.length === 0 ? (
              <div className="text-center py-12 text-slate-400 text-xs">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                No open escalations in the queue.
              </div>
            ) : (
              escalations.map((esc) => (
                <div
                  key={esc.id}
                  className={`p-4 rounded-xl border transition-all ${
                    esc.status === "resolved"
                      ? "bg-slate-50/50 border-slate-200 opacity-70"
                      : "bg-white border-amber-200 shadow-2xs"
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                          esc.priority === "urgent"
                            ? "bg-red-100 text-red-700 border border-red-200"
                            : "bg-amber-100 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {esc.priority}
                      </span>
                      <span className="text-xs font-mono text-slate-400">#ESC-{esc.id.slice(0, 6).toUpperCase()}</span>
                      <h4 className="font-bold text-slate-900 text-sm">{esc.reason}</h4>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          esc.status === "resolved"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {esc.status.toUpperCase()}
                      </span>
                      <button
                        onClick={() => setSelectedEscalation(esc)}
                        className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors"
                      >
                        Inspect & Resolve
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-700 mt-2 font-medium">{esc.summary}</p>
                  
                  <div className="flex items-center gap-4 text-[11px] text-slate-500 mt-3 pt-2 border-t border-slate-100">
                    <span>👤 {esc.user_name || "New Joiner"} ({esc.user_email})</span>
                    <span>🕒 {new Date(esc.created_at).toLocaleString()}</span>
                    {esc.resolution_notes && (
                      <span className="text-emerald-700 font-medium">✓ Notes: {esc.resolution_notes}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Checklist Templates */}
      {activeTab === "templates" && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Checklist Templates by Role & Location</h3>
              <p className="text-xs text-slate-500">Tasks automatically assigned to new joiners matching role and location criteria</p>
            </div>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add Template Task
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Title & Description</th>
                  <th className="py-2.5 px-3">Target Role</th>
                  <th className="py-2.5 px-3">Target Location</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Due (Days)</th>
                  <th className="py-2.5 px-3">Priority</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{t.title}</div>
                      <div className="text-[11px] text-slate-500 line-clamp-1">{t.description}</div>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-800">{t.role}</td>
                    <td className="py-3 px-3 font-medium text-slate-800">{t.location}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                        {t.category}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono">{t.due_days_from_hire}d</td>
                    <td className="py-3 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        t.priority === "high" ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
                      }`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => handleDeleteTemplate(t.id)}
                        className="p-1 hover:text-red-600 text-slate-400 transition-colors"
                        title="Delete template"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Proactive Nudges */}
      {activeTab === "nudges" && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-2xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/80 rounded-2xl">
            <div>
              <h3 className="font-bold text-blue-950 text-base flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" /> Automated Nudge & Reminder Engine
              </h3>
              <p className="text-xs text-blue-800/80 mt-1 max-w-xl">
                Background worker scans for overdue or imminent onboarding tasks and enqueues proactive reminders via Slack Webhooks and Contoso Outlook email.
              </p>
            </div>
            <button
              onClick={handleTriggerNudges}
              disabled={triggeringNudge}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all active:scale-95 shrink-0 flex items-center gap-2 disabled:opacity-50"
            >
              <Send className={`w-4 h-4 ${triggeringNudge ? "animate-spin" : ""}`} />
              Fast-Forward Nudges (Demo)
            </button>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 text-sm mb-3">Live Dispatched Reminders Stream</h4>
            {nudgeLog.length === 0 ? (
              <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl text-xs">
                Click "Fast-Forward Nudges (Demo)" to simulate the scheduled background worker run and inspect outbound Slack/Email messages.
              </div>
            ) : (
              <div className="space-y-3">
                {nudgeLog.map((n, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">
                        🔔 Target: {n.user_name} ({n.user_email})
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                        Dispatched via Slack + Email
                      </span>
                    </div>
                    <p className="p-3 bg-white rounded-lg border border-slate-200 text-slate-700 whitespace-pre-wrap font-sans text-[11px]">
                      {n.message}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 5: Grounding Documents */}
      {activeTab === "documents" && (
        <div className="bg-white rounded-b-xl border border-t-0 border-slate-200 p-6 shadow-2xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-base">Indexed Corporate Knowledge Base</h3>
              <p className="text-xs text-slate-500">Grounded policy documents ingested into vector store for RAG citations</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {documents.map((doc) => (
              <div key={doc.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-100 text-blue-700">
                      {doc.category}
                    </span>
                    <h4 className="font-bold text-slate-900 text-sm mt-1.5">{doc.title}</h4>
                    <p className="text-[11px] font-mono text-slate-500 mt-0.5">{doc.source_file}</p>
                  </div>
                  <BookOpen className="w-5 h-5 text-slate-400" />
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Indexed: {new Date(doc.created_at).toLocaleDateString()}</span>
                  <span className="text-emerald-600 font-semibold">Active in Vector Store</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalation Inspection Modal */}
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
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Conversation Transcript Snapshot</label>
              <div className="mt-2 p-3 bg-slate-50 rounded-xl border border-slate-200 max-h-48 overflow-y-auto space-y-2 text-xs">
                {selectedEscalation.context_messages?.map((m, mIdx) => (
                  <div key={mIdx} className="space-y-0.5">
                    <span className="font-bold text-[10px] text-slate-400 uppercase">{m.sender}:</span>
                    <p className="text-slate-700 bg-white p-2 rounded-lg border border-slate-100">{m.content}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Resolution Notes</label>
              <textarea
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter actions taken, HR outreach details, or resolution status..."
                rows={3}
                className="w-full mt-1.5 p-3 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
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

      {/* Add Checklist Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <form
            onSubmit={handleCreateTemplate}
            className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">New Checklist Template Task</h3>
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
                placeholder="e.g., Set up Local Kubernetes Cluster"
                className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 outline-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700">Description</label>
              <textarea
                value={newTemplate.description}
                onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                placeholder="Guidance and instructions for the new joiner..."
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
                  <option value="Software Engineer">Software Engineer</option>
                  <option value="Product Manager">Product Manager</option>
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
                  <option value="General">General</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700">Due Days From Hire</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={newTemplate.due_days_from_hire}
                  onChange={(e) => setNewTemplate({ ...newTemplate, due_days_from_hire: parseInt(e.target.value) || 3 })}
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
                Save Template
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
