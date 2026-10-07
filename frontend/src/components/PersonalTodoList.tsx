"use client";

import React, { useState, useMemo } from "react";
import { 
  CheckCircle2, Circle, Plus, Trash2, Calendar, 
  Tag, AlertCircle, Sparkles, Filter, Search, 
  Clock, CheckSquare, Edit3, X, ArrowUpDown, Flame
} from "lucide-react";
import { Task, api } from "@/lib/api";

interface PersonalTodoListProps {
  token: string;
  tasks: Task[];
  onRefreshTasks: () => void;
  onOpenAIChat?: (initialQuery: string) => void;
}

const CATEGORIES = [
  "All",
  "Personal Admin",
  "Engineering",
  "Meeting & 1:1",
  "Learning & Study",
  "Setup & Tools",
  "General"
];

const PRIORITIES = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
  { value: "high", label: "High", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { value: "medium", label: "Medium", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { value: "low", label: "Low", color: "text-slate-400 bg-slate-500/10 border-slate-500/20" },
];

const SUGGESTED_TASKS = [
  { title: "Schedule 1-on-1 with onboarding buddy", category: "Meeting & 1:1", priority: "high" },
  { title: "Configure local git SSH key & commit signoff", category: "Setup & Tools", priority: "urgent" },
  { title: "Explore team repository architecture & docs", category: "Engineering", priority: "medium" },
  { title: "Setup corporate Slack/Teams mobile notifications", category: "Personal Admin", priority: "low" },
];

export default function PersonalTodoList({
  token,
  tasks,
  onRefreshTasks,
  onOpenAIChat,
}: PersonalTodoListProps) {
  // Filter for personal / custom tasks
  // (Tasks with task_type === 'personal' or category === 'Personal' or created dynamically)
  const [filterTab, setFilterTab] = useState<"all" | "active" | "completed">("all");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [selectedPriority, setSelectedPriority] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Create new task form states
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState("Personal Admin");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit task state
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPriority, setEditPriority] = useState("medium");

  // Filter tasks: show personal tasks or all tasks user created
  const personalTasks = useMemo(() => {
    return tasks.filter(t => 
      t.task_type === "personal" || 
      t.category === "Personal" ||
      t.category === "Personal Admin" ||
      t.category === "Engineering" ||
      t.category === "Meeting & 1:1" ||
      t.category === "Learning & Study" ||
      t.category === "Setup & Tools" ||
      !t.mandatory
    );
  }, [tasks]);

  // Apply search and category / status filters
  const filteredTasks = useMemo(() => {
    return personalTasks.filter(t => {
      // Tab status filter
      if (filterTab === "active" && t.status === "completed") return false;
      if (filterTab === "completed" && t.status !== "completed") return false;

      // Category filter
      if (selectedCategory !== "All" && t.category !== selectedCategory) return false;

      // Priority filter
      if (selectedPriority !== "all" && t.priority !== selectedPriority) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = t.title.toLowerCase().includes(q);
        const matchesDesc = (t.description || "").toLowerCase().includes(q);
        const matchesCat = t.category.toLowerCase().includes(q);
        if (!matchesTitle && !matchesDesc && !matchesCat) return false;
      }

      return true;
    });
  }, [personalTasks, filterTab, selectedCategory, selectedPriority, searchQuery]);

  const stats = useMemo(() => {
    const total = personalTasks.length;
    const completed = personalTasks.filter(t => t.status === "completed").length;
    const active = total - completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, active, percentage };
  }, [personalTasks]);

  // Handle toggle task status
  const handleToggle = async (task: Task) => {
    try {
      const nextStatus = task.status === "completed" ? "pending" : "completed";
      await api.updateTaskStatus(token, task.id, nextStatus);
      onRefreshTasks();
    } catch (err) {
      console.error("Failed to toggle task:", err);
    }
  };

  // Handle create task
  const handleCreateTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTitle.trim()) return;

    setIsSubmitting(true);
    try {
      await api.createTask(token, {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        category: newCategory,
        task_type: "personal",
        priority: newPriority,
        mandatory: false,
        due_date: newDueDate ? new Date(newDueDate).toISOString() : undefined,
      });

      setNewTitle("");
      setNewDesc("");
      setNewDueDate("");
      setShowAddForm(false);
      onRefreshTasks();
    } catch (err) {
      console.error("Failed to create personal task:", err);
      alert("Failed to create task. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle quick add from suggestions
  const handleAddSuggested = async (suggested: typeof SUGGESTED_TASKS[0]) => {
    try {
      await api.createTask(token, {
        title: suggested.title,
        category: suggested.category,
        task_type: "personal",
        priority: suggested.priority,
        mandatory: false,
      });
      onRefreshTasks();
    } catch (err) {
      console.error("Failed to add suggested task:", err);
    }
  };

  // Handle delete task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm("Are you sure you want to delete this personal task?")) return;
    try {
      await api.deleteTask(token, taskId);
      onRefreshTasks();
    } catch (err) {
      console.error("Failed to delete task:", err);
      alert("Failed to delete task.");
    }
  };

  // Handle edit task
  const handleStartEdit = (t: Task) => {
    setEditingTaskId(t.id);
    setEditTitle(t.title);
    setEditDesc(t.description || "");
    setEditPriority(t.priority);
  };

  const handleSaveEdit = async (taskId: string) => {
    if (!editTitle.trim()) return;
    try {
      await api.updateTask(token, taskId, {
        title: editTitle.trim(),
        description: editDesc.trim() || undefined,
        priority: editPriority,
      });
      setEditingTaskId(null);
      onRefreshTasks();
    } catch (err) {
      console.error("Failed to update task:", err);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ─── HEADER & HERO BANNER ─── */}
      <div className="bg-[#121324] border border-white/10 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30 shrink-0">
              <CheckSquare className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-black text-white tracking-tight">Individual To-Do List</h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider">
                  Personal Space
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                Organize your custom goals, daily focus items, follow-up notes, and personalized onboarding checkpoints.
              </p>
            </div>
          </div>

          {/* Quick Metrics Bar & Action Button */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2">
              <div className="text-center pr-3 border-r border-white/10">
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">Total</p>
                <p className="text-sm font-black text-white">{stats.total}</p>
              </div>
              <div className="text-center px-3 border-r border-white/10">
                <p className="text-[10px] text-emerald-400/80 font-bold uppercase tracking-wider">Done</p>
                <p className="text-sm font-black text-emerald-400">{stats.completed}</p>
              </div>
              <div className="text-center pl-2">
                <p className="text-[10px] text-indigo-400/80 font-bold uppercase tracking-wider">Progress</p>
                <p className="text-sm font-black text-indigo-300">{stats.percentage}%</p>
              </div>
            </div>

            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              {showAddForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{showAddForm ? "Cancel" : "Add Personal Task"}</span>
            </button>
          </div>
        </div>

        {/* ─── ADD TASK FORM (Collapsible) ─── */}
        {showAddForm && (
          <form onSubmit={handleCreateTask} className="mt-6 pt-6 border-t border-white/10 space-y-4 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1">
                <label className="text-[11px] font-bold text-white/60">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Schedule coffee chat with engineering lead..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-white/60">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full bg-[#16172e] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white outline-none focus:border-indigo-500"
                >
                  {CATEGORIES.filter(c => c !== "All").map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-white/60">Priority Level</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="w-full bg-[#16172e] border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                >
                  <option value="urgent">🔥 Urgent Priority</option>
                  <option value="high">⚡ High Priority</option>
                  <option value="medium">🔹 Medium Priority</option>
                  <option value="low">🌱 Low Priority</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-white/60">Target Due Date (Optional)</label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={isSubmitting || !newTitle.trim()}
                  className="w-full py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs rounded-xl shadow-lg transition-transform active:scale-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isSubmitting ? "Creating..." : "Save to My To-Do List"}</span>
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-white/60">Notes / Details (Optional)</label>
              <textarea
                rows={2}
                placeholder="Add context, links, or sub-notes for this task..."
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-white/30 outline-none focus:border-indigo-500"
              />
            </div>
          </form>
        )}
      </div>

      {/* ─── CONTROLS: TABS, FILTERS & SEARCH ─── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-[#121324] border border-white/10 rounded-2xl p-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl">
          {[
            { id: "all", label: "All Items", count: stats.total },
            { id: "active", label: "In Progress", count: stats.active },
            { id: "completed", label: "Completed", count: stats.completed },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                filterTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${filterTab === tab.id ? "bg-white/20 text-white" : "bg-white/10 text-white/50"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Category Filter */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-white/40" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-white/30 outline-none focus:border-indigo-500 w-44 sm:w-56"
            />
          </div>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-[#16172e] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none focus:border-indigo-500"
          >
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── SUGGESTIONS ROW (If personal list is light) ─── */}
      {personalTasks.length < 5 && (
        <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Suggested Onboarding Action Items to Add
            </span>
            <span className="text-[10px] text-white/40">1-click add</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {SUGGESTED_TASKS.map((st, idx) => (
              <div 
                key={idx}
                onClick={() => handleAddSuggested(st)}
                className="bg-white/5 hover:bg-indigo-600/20 border border-white/10 hover:border-indigo-500/40 rounded-xl p-2.5 transition-all cursor-pointer group flex flex-col justify-between"
              >
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-indigo-300 block">{st.category}</span>
                  <p className="text-xs font-semibold text-white group-hover:text-indigo-200 transition-colors leading-tight">
                    {st.title}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between text-[10px] text-white/40 group-hover:text-indigo-300">
                  <span className="capitalize">{st.priority} priority</span>
                  <Plus className="w-3.5 h-3.5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── TASK CARDS LIST ─── */}
      <div className="space-y-2.5">
        {filteredTasks.length === 0 ? (
          <div className="bg-[#121324] border border-white/10 rounded-2xl p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-white/30">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">No tasks match your filter</h3>
              <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                {searchQuery || selectedCategory !== "All"
                  ? "Try resetting your search query or category filters."
                  : "You have not added any personal to-do tasks yet. Click 'Add Personal Task' above to start organizing!"}
              </p>
            </div>
          </div>
        ) : (
          filteredTasks.map(task => {
            const isCompleted = task.status === "completed";
            const isEditing = editingTaskId === task.id;

            return (
              <div
                key={task.id}
                className={`border rounded-2xl p-4 transition-all ${
                  isCompleted
                    ? "bg-white/[0.02] border-white/5 opacity-75"
                    : "bg-[#121324] border-white/10 hover:border-white/20 shadow-lg"
                }`}
              >
                {isEditing ? (
                  /* ── Inline Edit Mode ── */
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-indigo-500 font-bold"
                    />
                    <textarea
                      rows={2}
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="Task description..."
                      className="w-full bg-white/5 border border-white/20 rounded-xl p-2.5 text-xs text-white outline-none focus:border-indigo-500"
                    />
                    <div className="flex items-center justify-between">
                      <select
                        value={editPriority}
                        onChange={(e) => setEditPriority(e.target.value)}
                        className="bg-[#16172e] border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white outline-none"
                      >
                        <option value="urgent">Urgent</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditingTaskId(null)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white/60 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveEdit(task.id)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Normal View Mode ── */
                  <div className="flex items-start justify-between gap-3">
                    {/* Checkbox & Task details */}
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <button
                        onClick={() => handleToggle(task)}
                        className="mt-0.5 text-white/40 hover:text-white transition-colors cursor-pointer shrink-0"
                      >
                        {isCompleted ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-400 fill-emerald-500/20" />
                        ) : (
                          <Circle className="w-5 h-5 hover:text-indigo-400" />
                        )}
                      </button>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`text-xs font-bold leading-snug tracking-tight ${
                            isCompleted ? "line-through text-white/40" : "text-white"
                          }`}>
                            {task.title}
                          </h4>

                          {/* Category Tag */}
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-white/5 text-white/60 border border-white/5">
                            {task.category}
                          </span>

                          {/* Priority Badge */}
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                            task.priority === "urgent"
                              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                              : task.priority === "high"
                              ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                              : task.priority === "medium"
                              ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                              : "bg-slate-500/20 text-slate-300 border border-slate-500/30"
                          }`}>
                            {task.priority}
                          </span>
                        </div>

                        {task.description && (
                          <p className={`text-xs leading-relaxed ${isCompleted ? "text-white/30" : "text-white/60"}`}>
                            {task.description}
                          </p>
                        )}

                        {/* Metadata row */}
                        <div className="flex items-center gap-3 text-[11px] text-white/40 pt-1 flex-wrap">
                          {task.due_date && (
                            <span className="flex items-center gap-1 text-indigo-300/80">
                              <Calendar className="w-3 h-3" />
                              Due: {new Date(task.due_date).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                            </span>
                          )}
                          <span>Added {new Date(task.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {onOpenAIChat && (
                        <button
                          onClick={() => onOpenAIChat(`How do I complete my personal task: "${task.title}"?`)}
                          title="Ask AI Assistant about this task"
                          className="p-1.5 bg-white/5 hover:bg-indigo-600/30 text-white/40 hover:text-indigo-300 rounded-lg transition-all border border-white/5 cursor-pointer"
                        >
                          <Sparkles className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleStartEdit(task)}
                        title="Edit task"
                        className="p-1.5 bg-white/5 hover:bg-white/10 text-white/40 hover:text-white rounded-lg transition-all border border-white/5 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        title="Delete task"
                        className="p-1.5 bg-white/5 hover:bg-rose-500/20 text-white/40 hover:text-rose-400 rounded-lg transition-all border border-white/5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
