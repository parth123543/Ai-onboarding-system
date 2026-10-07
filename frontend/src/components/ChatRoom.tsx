"use client";

import React, { useState, useEffect } from "react";
import { 
  MessageSquare, Hash, Megaphone, Video, Send, 
  Sparkles, CheckCircle2, User, ExternalLink, Calendar, Plus 
} from "lucide-react";

interface Channel {
  id: string;
  name: string;
  description: string;
  is_announcement: boolean;
}

interface Message {
  id: string;
  channel_id: string;
  sender_id?: string;
  sender_name?: string;
  sender_role?: string;
  sender_is_admin?: boolean;
  content: string;
  metadata?: any;
  created_at: string;
}

interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

interface ChatRoomProps {
  currentUser?: {
    id: string;
    full_name?: string;
    email?: string;
    role?: string;
    is_admin?: boolean;
  } | null;
}

export default function ChatRoom({ currentUser }: ChatRoomProps) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(true);
  const [notificationToast, setNotificationToast] = useState<string | null>(null);

  // Teams Meeting Modal state
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  const [meetingSubject, setMeetingSubject] = useState("HR 1-on-1 Onboarding Check-in");
  const [meetingStartTime, setMeetingStartTime] = useState("2026-10-07T14:00:00Z");
  const [meetingEndTime, setMeetingEndTime] = useState("2026-10-07T14:30:00Z");
  const [createdMeetingUrl, setCreatedMeetingUrl] = useState<string | null>(null);

  const fetchChannels = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/enterprise-chat/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        if (data.length > 0 && !activeChannel) {
          setActiveChannel(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load channels:", e);
    }
  };

  const fetchAnnouncements = async () => {
    try {
      const res = await fetch("http://localhost:8000/api/v1/enterprise-chat/announcements");
      if (res.ok) {
        const data = await res.json();
        setAnnouncements(data);
      }
    } catch (e) {
      console.error("Failed to load announcements:", e);
    }
  };

  const fetchMessages = async (channelId: string) => {
    try {
      const res = await fetch(`http://localhost:8000/api/v1/enterprise-chat/channels/${channelId}/messages`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data);
      }
    } catch (e) {
      console.error("Failed to load messages:", e);
    }
  };

  useEffect(() => {
    fetchChannels();
    fetchAnnouncements();
    setLoading(false);
  }, []);

  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel.id);
    }
  }, [activeChannel]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeChannel) return;

    const myName = currentUser?.full_name || (currentUser?.is_admin ? "Maanvi" : "Parth Parashar");
    const myRole = currentUser?.role || (currentUser?.is_admin ? "Director of People Operations" : "Software Engineer");
    const isAdmin = Boolean(currentUser?.is_admin);

    const optimistic: Message = {
      id: "temp-" + Date.now(),
      channel_id: activeChannel.id,
      sender_id: currentUser?.id,
      sender_name: myName,
      sender_role: myRole,
      sender_is_admin: isAdmin,
      content: inputText,
      metadata: { 
        source: "launchmate",
        sender_name: myName,
        sender_role: myRole,
        is_admin: isAdmin,
      },
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    const textToSend = inputText;
    setInputText("");

    try {
      const url = currentUser?.id
        ? `http://localhost:8000/api/v1/enterprise-chat/channels/${activeChannel.id}/messages?sender_id=${currentUser.id}`
        : `http://localhost:8000/api/v1/enterprise-chat/channels/${activeChannel.id}/messages`;

      await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel_id: activeChannel.id,
          content: textToSend,
          metadata: { 
            source: "launchmate",
            sender_name: myName,
            sender_role: myRole,
            is_admin: isAdmin,
            is_announcement: activeChannel.is_announcement || isAdmin,
          }
        })
      });
      fetchMessages(activeChannel.id);
      fetchAnnouncements();

      if (isAdmin || activeChannel.is_announcement) {
        setNotificationToast("📢 Announcement broadcast & email notifications dispatched to all employee mail IDs via SendGrid!");
        setTimeout(() => setNotificationToast(null), 6000);
      }
    } catch (e) {
      console.error("Failed to post message:", e);
    }
  };

  const handleCreateTeamsMeeting = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("http://localhost:8000/api/v1/teams/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: meetingSubject,
          start_time: meetingStartTime,
          end_time: meetingEndTime,
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedMeetingUrl(data.join_url);
      }
    } catch (e) {
      console.error("Failed to create Teams meeting:", e);
    }
  };

  return (
    <div className="space-y-6">
      {/* Live SendGrid Notification Toast Banner */}
      {notificationToast && (
        <div className="bg-emerald-950/90 border border-emerald-500/50 rounded-2xl p-4 flex items-center justify-between gap-3 text-emerald-200 text-xs shadow-2xl backdrop-blur-xl animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping shrink-0" />
            <span className="font-bold text-white">{notificationToast}</span>
          </div>
          <button 
            onClick={() => setNotificationToast(null)} 
            className="text-emerald-400 hover:text-white px-2 py-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer text-xs font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Banner / Announcement Callout */}
      {announcements.length > 0 && (
        <div className="bg-gradient-to-r from-blue-900/40 via-indigo-900/30 to-purple-900/40 border border-blue-500/30 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/20 text-blue-300 rounded-xl">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 bg-blue-500/20 px-2 py-0.5 rounded-full">
                  Official Announcement
                </span>
                <h4 className="text-xs font-bold text-white">{announcements[0].title}</h4>
              </div>
              <p className="text-xs text-blue-100/70 mt-0.5">{announcements[0].body}</p>
            </div>
          </div>

          <button
            onClick={() => setShowMeetingModal(true)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/20 transition-all flex items-center gap-1.5 shrink-0"
          >
            <Video className="w-3.5 h-3.5 text-blue-400" />
            <span>Schedule Teams Video Call</span>
          </button>
        </div>
      )}

      {/* Main Chat Interface */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-[#121224] border border-white/10 rounded-3xl overflow-hidden min-h-[580px]">
        {/* Sidebar: Channels list */}
        <div className="border-r border-white/10 p-4 space-y-4 bg-[#0e0e1c]">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Channels</span>
            <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-2 py-0.5 rounded-full">
              Enterprise
            </span>
          </div>

          <div className="space-y-1">
            {channels.map(ch => (
              <button
                key={ch.id}
                onClick={() => setActiveChannel(ch)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
                  activeChannel?.id === ch.id
                    ? "bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/30"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                }`}
              >
                {ch.is_announcement ? (
                  <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Hash className="w-3.5 h-3.5 text-white/40" />
                )}
                <span>{ch.name}</span>
              </button>
            ))}
          </div>

          <div className="pt-4 border-t border-white/10">
            <button
              onClick={() => setShowMeetingModal(true)}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg cursor-pointer"
            >
              <Video className="w-4 h-4" />
              <span>Host Teams Meeting</span>
            </button>
          </div>
        </div>

        {/* Chat Feed */}
        <div className="md:col-span-3 flex flex-col justify-between p-4">
          {/* Header */}
          <div className="pb-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Hash className="w-4 h-4 text-indigo-400" />
                <h3 className="font-bold text-white text-sm">{activeChannel?.name || "General"}</h3>
              </div>
              <p className="text-[11px] text-white/40 mt-0.5">{activeChannel?.description}</p>
            </div>

            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-white/50">Live Sync</span>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto space-y-3 py-4 pr-2">
            {messages.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-white/30 text-xs">
                <MessageSquare className="w-8 h-8 mb-2 stroke-1" />
                <span>No messages yet. Send a greeting to the cohort!</span>
              </div>
            ) : (
              messages.map(m => {
                const displayName = m.sender_name || m.metadata?.sender_name || (m.sender_is_admin ? "Maanvi" : "Parth Parashar");
                const displayRole = m.sender_role || m.metadata?.sender_role || (m.sender_is_admin ? "Director of People Operations" : "Software Engineer");
                const isAdmin = Boolean(m.sender_is_admin || m.metadata?.is_admin || displayName.toLowerCase().includes("maanvi"));
                const initial = displayName ? displayName.trim().charAt(0).toUpperCase() : "U";

                return (
                  <div key={m.id} className="bg-white/5 border border-white/5 rounded-2xl p-3.5 space-y-1.5 hover:bg-white/[0.07] transition-all">
                    <div className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${
                          isAdmin 
                            ? "bg-gradient-to-tr from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20" 
                            : "bg-indigo-600/40 text-indigo-300 border border-indigo-500/30"
                        }`}>
                          {initial}
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-white tracking-tight">{displayName}</span>
                          {isAdmin ? (
                            <span className="bg-amber-500/20 text-amber-300 text-[9px] font-black px-1.5 py-0.5 rounded border border-amber-500/30 tracking-wider">
                              HR ADMIN
                            </span>
                          ) : (
                            <span className="text-[10px] text-white/40">
                              · {displayRole}
                            </span>
                          )}
                        </div>
                        {m.metadata?.source === "teams" && (
                          <span className="bg-blue-500/20 text-blue-300 text-[9px] font-bold px-1.5 py-0.5 rounded border border-blue-500/30 flex items-center gap-1">
                            Teams
                          </span>
                        )}
                      </div>
                      <span className="text-white/30 text-[10px]">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-xs text-white/90 pl-8 leading-relaxed whitespace-pre-wrap">{m.content}</p>
                  </div>
                );
              })
            )}
          </div>

          {/* Input Form */}
          <form onSubmit={handleSendMessage} className="pt-3 border-t border-white/10 flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Message #${activeChannel?.name || "general"}...`}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/30 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-lg transition-transform active:scale-95 cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Teams Meeting Creator Modal */}
      {showMeetingModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#16162a] border border-white/15 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                <Video className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Host Microsoft Teams Video Meeting</h3>
                <p className="text-[11px] text-white/50">Delegated Microsoft Graph Online Meetings API</p>
              </div>
            </div>

            {!createdMeetingUrl ? (
              <form onSubmit={handleCreateTeamsMeeting} className="space-y-3">
                <div>
                  <label className="text-xs text-white/60 font-semibold block mb-1">Subject</label>
                  <input
                    type="text"
                    required
                    value={meetingSubject}
                    onChange={(e) => setMeetingSubject(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-white/60 font-semibold block mb-1">Start Time (UTC)</label>
                    <input
                      type="text"
                      value={meetingStartTime}
                      onChange={(e) => setMeetingStartTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-white/60 font-semibold block mb-1">End Time (UTC)</label>
                    <input
                      type="text"
                      value={meetingEndTime}
                      onChange={(e) => setMeetingEndTime(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowMeetingModal(false)}
                    className="px-4 py-2 text-xs text-white/60 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-lg"
                  >
                    Generate Video Link
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Teams Meeting Created Successfully!</span>
                  </div>
                  <p className="text-white/70 text-[11px]">
                    Share this Microsoft Teams link with your new joiner or join directly now:
                  </p>
                  <a
                    href={createdMeetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-blue-400 underline font-semibold text-xs break-all"
                  >
                    <span>{createdMeetingUrl}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>

                <div className="flex items-center justify-end">
                  <button
                    onClick={() => {
                      setCreatedMeetingUrl(null);
                      setShowMeetingModal(false);
                    }}
                    className="px-5 py-2 text-xs font-bold bg-white text-black hover:bg-white/90 rounded-xl"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
