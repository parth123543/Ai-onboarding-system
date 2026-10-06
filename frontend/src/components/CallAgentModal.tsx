"use client";

import React, { useState, useEffect } from "react";
import {
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Clock,
  ShieldCheck,
  UserCheck,
  Sparkles,
  Copy,
  Check,
  Volume2,
  Mic,
  MicOff,
  Headphones,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from "lucide-react";
import { api, AgentLine, User } from "../lib/api";

interface CallAgentModalProps {
  token?: string;
  currentUser?: User | null;
  initialTopic?: string;
  onClose: () => void;
}

export default function CallAgentModal({
  token,
  currentUser,
  initialTopic,
  onClose
}: CallAgentModalProps) {
  const [activeTab, setActiveTab] = useState<"call_us" | "call_me">("call_us");
  const [assignedLine, setAssignedLine] = useState<AgentLine | null>(null);
  const [allLines, setAllLines] = useState<AgentLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);

  // "Call Me Now" (Amazon style callback) state
  const [callbackPhone, setCallbackPhone] = useState(currentUser?.phone_number || "");
  const [callbackTopic, setCallbackTopic] = useState(initialTopic || "Unresolved onboarding query");
  const [callbackNotes, setCallbackNotes] = useState("");
  const [submittingCallback, setSubmittingCallback] = useState(false);
  const [callbackStatus, setCallbackStatus] = useState<any>(null);

  // In-browser interactive call simulator state
  const [isCalling, setIsCalling] = useState(false);
  const [callConnected, setCallConnected] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [agentSpeakingText, setAgentSpeakingText] = useState("");

  useEffect(() => {
    loadLines();
  }, [token, initialTopic]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (callConnected) {
      timer = setInterval(() => {
        setCallSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callConnected]);

  const loadLines = async () => {
    setLoading(true);
    try {
      const data = await api.getAgentLines(token, initialTopic);
      setAssignedLine(data.assigned_line);
      setAllLines(data.all_lines);
      if (data.user_phone && !callbackPhone) {
        setCallbackPhone(data.user_phone);
      }
    } catch (err) {
      console.error("Failed to load agent phone lines", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (num: string) => {
    navigator.clipboard.writeText(num);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRequestCallback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackPhone.trim()) {
      alert("Please enter a valid phone number");
      return;
    }
    setSubmittingCallback(true);
    try {
      const res = await api.requestAgentCall(token, {
        phone_number: callbackPhone,
        topic: callbackTopic,
        call_type: "callback",
        notes: callbackNotes
      });
      setCallbackStatus(res);
    } catch (err: any) {
      alert(err.message || "Failed to submit callback request");
    } finally {
      setSubmittingCallback(false);
    }
  };

  const startInBrowserSimulation = async () => {
    setIsCalling(true);
    setCallConnected(false);
    setCallSeconds(0);
    setAgentSpeakingText("Connecting to secure Launch Mate voice gateway...");

    // Log call initiation to backend
    try {
      await api.requestAgentCall(token, {
        phone_number: assignedLine?.phone_number || "In-Browser VoIP",
        topic: initialTopic || "In-browser voice conversation",
        call_type: "in_browser_simulation"
      });
    } catch (e) {
      console.warn("Could not log VoIP session", e);
    }

    // Simulate ringing for 2.5 seconds then connect
    setTimeout(() => {
      setCallConnected(true);
      const greeting = `Hello ${currentUser?.full_name || "there"}! This is ${assignedLine?.agent_name || "Support"} from Launch Mate ${assignedLine?.department || "HR"}. I see you're an onboarding employee in ${currentUser?.location || "our global office"}. How can I help resolve your question today?`;
      setAgentSpeakingText(greeting);
    }, 2400);
  };

  const endCall = () => {
    setIsCalling(false);
    setCallConnected(false);
    setCallSeconds(0);
    setAgentSpeakingText("");
  };

  const formatTimer = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${mins.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 shadow-xs">
              <PhoneCall className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base tracking-tight">Talk to a Human Agent</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-ping" />
                  Live Available
                </span>
              </div>
              <p className="text-xs text-blue-100">
                Direct phone support for queries unresolved by AI assistant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white p-2 rounded-xl hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Modal Content Scroll Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Active Call Simulation View (if calling) */}
          {isCalling ? (
            <div className="bg-slate-900 text-white rounded-2xl p-6 text-center space-y-5 shadow-xl border border-slate-800">
              <div className="relative inline-block mx-auto">
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-xl font-bold uppercase shadow-lg mx-auto">
                  {assignedLine?.avatar || "CS"}
                </div>
                {callConnected && (
                  <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 rounded-full border-2 border-slate-900 flex items-center justify-center text-[10px]">
                    ✓
                  </span>
                )}
              </div>

              <div>
                <h4 className="text-lg font-bold">{assignedLine?.agent_name}</h4>
                <p className="text-xs text-slate-400">{assignedLine?.role}</p>
                <div className="mt-2 text-xs font-mono font-bold tracking-widest text-emerald-400">
                  {callConnected ? `CONNECTED • ${formatTimer(callSeconds)}` : "DIALING AGENT..."}
                </div>
              </div>

              {/* Audio Waveform Animation */}
              <div className="flex items-center justify-center gap-1 h-8">
                {[40, 70, 90, 50, 85, 60, 95, 45, 75, 55].map((h, i) => (
                  <div
                    key={i}
                    className={`w-1 rounded-full bg-blue-400 transition-all duration-300 ${
                      callConnected ? "animate-pulse" : "opacity-30"
                    }`}
                    style={{ height: callConnected ? `${h}%` : "20%" }}
                  />
                ))}
              </div>

              {/* Agent Voice Transcript Bubble */}
              <div className="bg-slate-800/80 rounded-xl p-4 text-xs text-slate-200 border border-slate-700/60 leading-relaxed text-left">
                <span className="text-[10px] uppercase font-bold text-blue-400 block mb-1">
                  Live Voice Transcript:
                </span>
                "{agentSpeakingText}"
              </div>

              {/* In-Call Controls */}
              <div className="flex items-center justify-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3 rounded-full border transition-all ${
                    isMuted
                      ? "bg-amber-600 border-amber-500 text-white"
                      : "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700"
                  }`}
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  type="button"
                  onClick={endCall}
                  className="px-6 py-3 rounded-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95"
                >
                  <PhoneOff className="w-4 h-4" /> End Call
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Assigned Agent Profile Card */}
              {assignedLine && (
                <div className="bg-gradient-to-br from-blue-50/70 via-indigo-50/40 to-slate-50 border border-blue-200/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                      {assignedLine.avatar}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm">
                          {assignedLine.agent_name}
                        </h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                          Ext: {assignedLine.direct_extension}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 font-medium">{assignedLine.role}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{assignedLine.specialty}</p>
                    </div>
                  </div>

                  <div className="sm:text-right shrink-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Status</span>
                    <span className="text-xs font-bold text-emerald-600 flex items-center sm:justify-end gap-1">
                      <Clock className="w-3 h-3" /> Wait: {assignedLine.wait_time}
                    </span>
                  </div>
                </div>
              )}

              {/* Mode Switcher: Call Us vs Call Me Now (Amazon Style) */}
              <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab("call_us")}
                  className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                    activeTab === "call_us"
                      ? "bg-white text-blue-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Phone className="w-3.5 h-3.5" /> Call Us Directly
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("call_me")}
                  className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
                    activeTab === "call_me"
                      ? "bg-white text-blue-700 shadow-2xs font-bold"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <PhoneForwarded className="w-3.5 h-3.5" /> Call Me Now (Instant Callback)
                </button>
              </div>

              {/* Tab 1: Call Us Directly */}
              {activeTab === "call_us" && assignedLine && (
                <div className="space-y-4">
                  <div className="p-5 bg-white border border-slate-200 rounded-2xl text-center space-y-3 shadow-2xs">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                      Assigned Agent Direct Helpline
                    </span>

                    <div className="flex items-center justify-center gap-3">
                      <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight font-mono">
                        {assignedLine.phone_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(assignedLine.phone_number)}
                        className="p-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                        title="Copy phone number"
                      >
                        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <p className="text-xs text-slate-500 max-w-sm mx-auto">
                      Available during company business hours with automatic overflow routing.
                    </p>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                      {/* Direct Tel: protocol link */}
                      <a
                        href={`tel:${assignedLine.phone_number}`}
                        className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Phone className="w-4 h-4" /> Call via Phone / FaceTime
                      </a>

                      {/* Interactive In-Browser Voice Call Simulator */}
                      <button
                        type="button"
                        onClick={startInBrowserSimulation}
                        className="w-full sm:w-auto px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-transform active:scale-95 flex items-center justify-center gap-2"
                      >
                        <Headphones className="w-4 h-4 text-amber-300" /> Simulate In-Browser VoIP Call
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Call Me Now (Amazon Style Callback) */}
              {activeTab === "call_me" && (
                <div className="space-y-4">
                  {callbackStatus ? (
                    <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center space-y-3">
                      <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                        <Check className="w-6 h-6" />
                      </div>
                      <h4 className="font-bold text-emerald-900 text-base">Callback Request Queued!</h4>
                      <p className="text-xs text-emerald-800 leading-relaxed max-w-md mx-auto">
                        {callbackStatus.message}
                      </p>
                      <div className="p-3 bg-white rounded-xl border border-emerald-200 text-xs text-slate-700 inline-block text-left">
                        <div><strong>Assigned Agent:</strong> {callbackStatus.assigned_agent}</div>
                        <div><strong>Helpline Line:</strong> {callbackStatus.assigned_phone_number}</div>
                        <div><strong>Target Number:</strong> {callbackPhone}</div>
                      </div>
                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={() => setCallbackStatus(null)}
                          className="text-xs font-semibold text-emerald-700 hover:underline"
                        >
                          Submit another request
                        </button>
                      </div>
                    </div>
                  ) : (
                    <form onSubmit={handleRequestCallback} className="space-y-3.5">
                      <div>
                        <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                          <span>Your Phone Number (where we should call you)</span>
                          <span className="text-[10px] text-blue-600 font-semibold">Immediate Dispatch</span>
                        </label>
                        <input
                          type="tel"
                          required
                          value={callbackPhone}
                          onChange={(e) => setCallbackPhone(e.target.value)}
                          placeholder="+91 9772835979 or +1 425 555 0199"
                          className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none font-mono"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700">What do you need help with?</label>
                        <input
                          type="text"
                          value={callbackTopic}
                          onChange={(e) => setCallbackTopic(e.target.value)}
                          placeholder="e.g. Need clarification on Azure subscription access / MFA setup"
                          className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold text-slate-700">Additional Notes / Transcript Context (Optional)</label>
                        <textarea
                          value={callbackNotes}
                          onChange={(e) => setCallbackNotes(e.target.value)}
                          placeholder="Provide any error message or detail so the agent is prepared before dialing you..."
                          rows={2}
                          className="w-full mt-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:border-blue-500 focus:bg-white outline-none"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submittingCallback}
                        className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <PhoneForwarded className="w-4 h-4" />
                        {submittingCallback ? "Queueing Callback..." : "Call Me Now"}
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* Collapsible: View All Available Support Lines */}
              <div className="pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAllLines(!showAllLines)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-800 py-1"
                >
                  <span>View All Dedicated Support Lines ({allLines.length})</span>
                  {showAllLines ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showAllLines && (
                  <div className="mt-3 space-y-2">
                    {allLines.map((line) => (
                      <div
                        key={line.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-bold text-slate-900">{line.agent_name} ({line.department})</div>
                          <div className="text-[11px] text-slate-500">{line.role}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-1 rounded border border-blue-200/60">
                            {line.phone_number}
                          </span>
                          <a
                            href={`tel:${line.phone_number}`}
                            className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                            title="Call this line"
                          >
                            <Phone className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Encrypted Microsoft Corporate Voice Gateway
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
