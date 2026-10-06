"use client";

import React, { useState, useEffect } from "react";
import { 
  Kanban, Plus, Clock, AlertCircle, CheckCircle2, 
  MessageSquare, ChevronRight, User, Tag, Sparkles, Filter 
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
  type: string;
  status: "todo" | "in_progress" | "in_review" | "done";
  priority: "urgent" | "high" | "medium" | "low";
  due_date?: string;
  sla_hours?: number;
  story_points?: number;
  assignee_name?: string;
  category?: string;
  subtasks: SubTask[];
}

const COLUMNS = [
  { id: "todo", title: "To Do", bg: "bg-slate-900/40", border: "border-slate-800", dot: "bg-slate-400" },
  { id: "in_progress", title: "In Progress", bg: "bg-blue-950/20", border: "border-blue-900/30", dot: "bg-blue-400" },
  { id: "in_review", title: "In Review", bg: "bg-purple-950/20", border: "border-purple-900/30", dot: "bg-purple-400" },
  { id: "done", title: "Done", bg: "bg-emerald-950/20", border: "border-emerald-900/30", dot: "bg-emerald-400" },
];

export default function KanbanBoard() {
  const [tasks, setTasks] = useState<JiraTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<JiraTask | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState<"urgent"|"high"|"medium"|"low">("high");
  const [newPoints, setNewPoints] = useState(2);

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

  useEffect(() => {
    fetchTasks();
  }, []);

  const moveTask = async (taskId: string, newStatus: string) => {
    // Optimistic UI update
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
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
          priority: newPriority,
          story_points: newPoints,
          status: "todo",
          type: "task",
          category: "Engineering",
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

  const priorityColor = (p: string) => {
    switch (p) {
      case "urgent": return "text-red-400 bg-red-500/10 border-red-500/30";
      case "high": return "text-amber-400 bg-amber-500/10 border-amber-500/30";
      case "medium": return "text-blue-400 bg-blue-500/10 border-blue-500/30";
      default: return "text-slate-400 bg-slate-500/10 border-slate-500/30";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#121224] p-5 rounded-2xl border border-white/10">
        <div>
          <div className="flex items-center gap-2">
            <Kanban className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-white tracking-tight">Enterprise Sprint Board (Jira Engine)</h2>
            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Active Sprint
            </span>
          </div>
          <p className="text-xs text-white/50 mt-1">
            Real-time agile issue tracking, work estimation, and automated SLA transitions for new hire onboarding.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Create Issue</span>
        </button>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map(col => {
          const colTasks = tasks.filter(t => t.status === col.id);
          return (
            <div key={col.id} className={`rounded-2xl border ${col.border} ${col.bg} p-4 flex flex-col min-h-[500px]`}>
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                  <span className="font-bold text-xs text-white uppercase tracking-wider">{col.title}</span>
                </div>
                <span className="text-[11px] font-bold text-white/40 bg-white/5 px-2 py-0.5 rounded-full">
                  {colTasks.length}
                </span>
              </div>

              {/* Tasks List */}
              <div className="flex-1 space-y-3 overflow-y-auto">
                {colTasks.length === 0 ? (
                  <div className="h-32 border border-dashed border-white/10 rounded-xl flex items-center justify-center text-[11px] text-white/30">
                    No issues
                  </div>
                ) : (
                  colTasks.map(task => (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="bg-[#18182e]/90 hover:bg-[#20203a] border border-white/10 hover:border-indigo-500/40 rounded-xl p-3.5 transition-all shadow-md cursor-pointer group space-y-2.5"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-mono font-bold text-indigo-400">{task.key}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${priorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                      </div>

                      <h4 className="text-xs font-semibold text-white/90 group-hover:text-white line-clamp-2">
                        {task.title}
                      </h4>

                      <div className="flex items-center justify-between text-[10px] text-white/40 pt-1 border-t border-white/5">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3 text-white/30" />
                          <span>{task.assignee_name || "Unassigned"}</span>
                        </div>
                        {task.story_points && (
                          <span className="bg-white/5 px-1.5 py-0.5 rounded text-white/60 font-mono font-bold">
                            {task.story_points} pts
                          </span>
                        )}
                      </div>

                      {/* Fast transition buttons */}
                      <div className="flex items-center justify-end gap-1 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {col.id !== "todo" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); moveTask(task.id, "todo"); }}
                            className="text-[9px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-white/60 rounded"
                          >
                            ← To Do
                          </button>
                        )}
                        {col.id !== "in_progress" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); moveTask(task.id, "in_progress"); }}
                            className="text-[9px] px-1.5 py-0.5 bg-blue-500/20 text-blue-300 rounded"
                          >
                            Progress
                          </button>
                        )}
                        {col.id !== "done" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); moveTask(task.id, "done"); }}
                            className="text-[9px] px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 rounded"
                          >
                            Done ✓
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Issue Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16162a] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-white">Create Sprint Issue</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <div>
                <label className="text-xs text-white/60 font-semibold block mb-1">Issue Summary</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. Enroll Security Keys & YubiKey"
                  className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs text-white/60 font-semibold block mb-1">Description (Markdown)</label>
                <textarea
                  rows={3}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Detailed instructions or acceptance criteria..."
                  className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-white/60 font-semibold block mb-1">Priority</label>
                  <select
                    value={newPriority}
                    onChange={(e: any) => setNewPriority(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[#1f1f38] border border-white/10 rounded-xl text-white outline-none"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-white/60 font-semibold block mb-1">Story Points</label>
                  <input
                    type="number"
                    min={1}
                    max={13}
                    value={newPoints}
                    onChange={(e) => setNewPoints(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs text-white/60 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
