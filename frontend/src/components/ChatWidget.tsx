"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  X,
  Send,
  Sparkles,
  ShieldAlert,
  CheckCircle2,
  FileText,
  AlertTriangle,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Ticket,
  Calendar,
  Layers,
  PhoneCall
} from "lucide-react";
import { api, ChatMessage, Citation } from "../lib/api";

interface ChatWidgetProps {
  token: string;
  currentUser: any;
  onTaskUpdated?: () => void;
  isOpenDefault?: boolean;
  isFloating?: boolean;
  onCallAgent?: (topic?: string) => void;
}

function FormattedMessage({ content, isUser }: { content: string; isUser?: boolean }) {
  if (isUser) {
    return <div className="whitespace-pre-wrap font-sans">{content}</div>;
  }

  // Parse inline markdown tokens: bold, italic, code
  const renderInline = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={i} className="font-semibold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return <em key={i} className="italic text-slate-700">{part.slice(1, -1)}</em>;
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="px-1.5 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-[11px]">
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: { type: "bullet" | "number"; items: React.ReactNode[] } | null = null;

  const flushList = () => {
    if (currentList) {
      if (currentList.type === "bullet") {
        elements.push(
          <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-0.5">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="flex items-start gap-2 text-slate-800">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
                <span className="flex-1 leading-relaxed">{item}</span>
              </li>
            ))}
          </ul>
        );
      } else {
        elements.push(
          <ol key={`list-${elements.length}`} className="my-2 space-y-1.5 pl-1 list-decimal list-inside text-slate-800">
            {currentList.items.map((item, idx) => (
              <li key={idx} className="leading-relaxed">{item}</li>
            ))}
          </ol>
        );
      }
      currentList = null;
    }
  };

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Horizontal rule
    if (trimmed === "---" || trimmed === "***") {
      flushList();
      elements.push(<hr key={idx} className="my-3 border-slate-200" />);
      return;
    }

    // Bullet points (•, -, *) or numbered items
    if (/^([•\-\*]|\d+\.)\s+/.test(trimmed)) {
      const isNumbered = /^\d+\.\s+/.test(trimmed);
      const listType = isNumbered ? "number" : "bullet";
      const itemText = trimmed.replace(/^([•\-\*]|\d+\.)\s+/, "");

      if (!currentList || currentList.type !== listType) {
        flushList();
        currentList = { type: listType, items: [] };
      }
      currentList.items.push(renderInline(itemText));
      return;
    }

    // Not a list item
    flushList();

    if (!trimmed) {
      // Empty line / paragraph break
      elements.push(<div key={idx} className="h-1.5" />);
      return;
    }

    // Headers
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={idx} className="text-xs sm:text-sm font-bold text-slate-900 mt-2.5 mb-1">
          {renderInline(trimmed.slice(4))}
        </h4>
      );
      return;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={idx} className="text-sm font-bold text-slate-900 mt-3 mb-1.5">
          {renderInline(trimmed.slice(3))}
        </h3>
      );
      return;
    }
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={idx} className="text-base font-bold text-slate-900 mt-3 mb-1.5">
          {renderInline(trimmed.slice(2))}
        </h2>
      );
      return;
    }

    // Source note box
    if (trimmed.startsWith("📄 Sources:") || trimmed.startsWith("📄 Source:")) {
      elements.push(
        <div key={idx} className="mt-2.5 p-2 rounded-lg bg-blue-50/90 border border-blue-200/80 text-blue-900 text-[11px] font-medium flex items-center gap-1.5">
          <span>{trimmed}</span>
        </div>
      );
      return;
    }

    // Regular paragraph
    elements.push(
      <p key={idx} className="text-slate-800 leading-relaxed">
        {renderInline(trimmed)}
      </p>
    );
  });

  flushList();

  return <div className="space-y-1 text-xs sm:text-sm">{elements}</div>;
}

export default function ChatWidget({
  token,
  currentUser,
  onTaskUpdated,
  isOpenDefault = false,
  isFloating = true,
  onCallAgent,
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(isOpenDefault);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingCitations, setStreamingCitations] = useState<Citation[]>([]);
  const [streamingRouter, setStreamingRouter] = useState<any>(null);
  const [streamingAction, setStreamingAction] = useState<any>(null);
  const [expandedCitations, setExpandedCitations] = useState<Record<number, boolean>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const conversationId = `session-${currentUser?.id || "default"}`;

  // Load chat history on mount or user switch
  useEffect(() => {
    if (!token) return;
    loadHistory();
  }, [token, currentUser?.id]);

  const loadHistory = async () => {
    try {
      const history = await api.getChatHistory(token, conversationId);
      if (history.length > 0) {
        setMessages(history);
      } else {
        // Default warm welcome
        setMessages([
          {
            id: "welcome-msg",
            conversation_id: conversationId,
            sender: "assistant",
            content: `👋 Hi **${currentUser?.full_name?.split(" ")[0] || "there"}**! I'm your AI Onboarding Assistant.\n\nI can help you understand company policies, answer benefits and IT questions with verified citations, or perform actions for you like marking tasks complete, raising IT tickets, or connecting you with HR.\n\nWhat can I help you with today?`,
            category: "knowledge_query",
            confidence: 1.0,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err) {
      console.error("Failed to load chat history", err);
    }
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  const handleSend = async (messageText?: string) => {
    const textToSend = (messageText || input).trim();
    if (!textToSend || isStreaming) return;

    setInput("");
    setIsStreaming(true);
    setStreamingContent("");
    setStreamingCitations([]);
    setStreamingRouter(null);
    setStreamingAction(null);

    // Optimistically append user message
    const userMessage: ChatMessage = {
      id: `usr-${Date.now()}`,
      conversation_id: conversationId,
      sender: "user",
      content: textToSend,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMessage]);

    let accumulatedTokens = "";
    let accumulatedCitations: Citation[] = [];
    let detectedRouter: any = null;
    let detectedAction: any = null;

    api.streamChat(
      token,
      textToSend,
      conversationId,
      // onToken
      (tokenChunk) => {
        accumulatedTokens += tokenChunk;
        setStreamingContent(accumulatedTokens);
      },
      // onRouter
      (decision) => {
        detectedRouter = decision;
        setStreamingRouter(decision);
      },
      // onAction
      (action) => {
        detectedAction = action;
        setStreamingAction(action);
        if (action.action === "complete_task" || action.action === "raise_it_ticket" || action.action === "book_orientation") {
          onTaskUpdated?.();
        }
      },
      // onCitations
      (citations) => {
        accumulatedCitations = citations;
        setStreamingCitations(citations);
      },
      // onComplete
      (category) => {
        const botMessage: ChatMessage = {
          id: `bot-${Date.now()}`,
          conversation_id: conversationId,
          sender: "assistant",
          content: accumulatedTokens,
          category: (detectedRouter?.category || category || "knowledge_query") as any,
          confidence: detectedRouter?.confidence,
          citations: accumulatedCitations.length > 0 ? accumulatedCitations : undefined,
          agent_action: detectedAction,
          created_at: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, botMessage]);
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingCitations([]);
        setStreamingRouter(null);
        setStreamingAction(null);
      },
      // onError
      (err) => {
        console.error("Streaming error", err);
        setIsStreaming(false);
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            conversation_id: conversationId,
            sender: "assistant",
            content: "I encountered a network timeout while connecting to the AI services. Please try again or connect directly with HR.",
            category: "escalate",
            created_at: new Date().toISOString(),
          },
        ]);
      }
    );
  };

  const handleClearHistory = async () => {
    if (confirm("Reset conversation history for this demo session?")) {
      await api.clearChatHistory(token, conversationId);
      await loadHistory();
    }
  };

  const toggleCitationExpand = (idx: number) => {
    setExpandedCitations((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const quickPrompts = [
    { label: "💻 Laptop & IT Policy", query: "What laptop model will I receive and what are the Intune setup steps?" },
    { label: "💰 $1,200 Home Office Stipend", query: "How do I claim the $1,200 home office ergonomic allowance?" },
    { label: "🏥 401(k) & Health Benefits", query: "What is the 401k employer match and when does it vest?" },
    { label: "✅ Mark MFA as Done", query: "Please mark my Multi-Factor Authentication task as completed" },
    { label: "🎟️ Raise IT Ticket", query: "Raise an IT ticket: I need access to the engineering Azure subscription" },
    { label: "🚨 Sensitive HR Question", query: "I have a concern regarding compensation equity and workplace harassment" },
  ];

  return (
    <>
      {/* Floating launcher badge if in floating mode */}
      {isFloating && !isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-2xl shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all duration-200 group border border-blue-400/30"
          aria-label="Open AI Onboarding Assistant"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 animate-pulse text-amber-300" />
            <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
          </div>
          <span className="font-semibold text-sm tracking-wide">AI Onboarding Assistant</span>
        </button>
      )}

      {/* Main Chat Drawer / Window */}
      {(isOpen || !isFloating) && (
        <div
          className={`flex flex-col bg-[#12121f] rounded-3xl shadow-2xl border border-white/10 overflow-hidden transition-all duration-300 z-50 text-white ${
            isFloating
              ? `fixed bottom-6 right-6 ${
                  isExpanded
                    ? "w-[94vw] sm:w-[680px] h-[85vh] max-h-[820px]"
                    : "w-[94vw] sm:w-[440px] h-[640px] max-h-[85vh]"
                }`
              : "w-full h-full min-h-[600px]"
          }`}
        >
          {/* Header */}
          <div className="px-5 py-4 bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white flex items-center justify-between shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/10 rounded-xl backdrop-blur-md border border-white/20">
                <Sparkles className="w-5 h-5 text-amber-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm leading-none">Launch Mate AI Assistant</h3>
                  <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 rounded">
                    GPT-4o RAG
                  </span>
                </div>
                <p className="text-[11px] text-blue-100/90 mt-1">
                  Grounding docs • Agent workflows • Human handoff
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-blue-100">
              {onCallAgent && (
                <button
                  type="button"
                  onClick={() => onCallAgent()}
                  title="Talk directly to a human onboarding agent"
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-emerald-300 flex items-center gap-1"
                >
                  <PhoneCall className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleClearHistory}
                title="Reset conversation"
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              {isFloating && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? "Collapse" : "Expand"}
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
              )}
              {isFloating && (
                <button
                  onClick={() => setIsOpen(false)}
                  title="Close chat"
                  className="p-1.5 hover:bg-white/10 rounded-lg transition-colors ml-1"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          </div>

          {/* Quick Prompts Carousel */}
          <div className="px-4 py-2.5 bg-white/5 border-b border-white/10 overflow-x-auto whitespace-nowrap flex gap-2 text-xs scrollbar-none">
            {quickPrompts.map((p, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(p.query)}
                disabled={isStreaming}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 rounded-full transition-all text-[11px] font-medium shadow-2xs shrink-0 disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Messages Scroll Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0a0a14]/60">
            {messages.map((msg, idx) => (
              <div
                key={msg.id || idx}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                {/* Router Badge for Assistant Responses */}
                {msg.sender === "assistant" && msg.category && (
                  <div className="flex items-center gap-1.5 mb-1.5 ml-1">
                    {msg.category === "knowledge_query" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                        <FileText className="w-3 h-3" /> Grounded Knowledge Q&A
                      </span>
                    )}
                    {msg.category === "task_action" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <Cpu className="w-3 h-3" /> Agent Action Executed
                      </span>
                    )}
                    {msg.category === "conversation" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 border border-purple-200">
                        <Sparkles className="w-3 h-3 text-purple-600" /> Assistant Greeting
                      </span>
                    )}
                    {msg.category === "escalate" && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                        <ShieldAlert className="w-3 h-3 text-amber-600" /> Human Escalation Triggered
                      </span>
                    )}
                    {msg.confidence !== undefined && (
                      <span className="text-[10px] text-slate-400">
                        ({Math.round(msg.confidence * 100)}% conf)
                      </span>
                    )}
                  </div>
                )}

                {/* Message Bubble */}
                <div
                  className={`max-w-[88%] rounded-2xl p-4 text-xs sm:text-sm leading-relaxed shadow-xs ${
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-br-xs"
                      : msg.category === "escalate"
                      ? "bg-amber-50 text-slate-900 border border-amber-200 rounded-bl-xs"
                      : "bg-white text-slate-900 border border-slate-200 rounded-bl-xs"
                  }`}
                >
                  <FormattedMessage content={msg.content} isUser={msg.sender === "user"} />

                  {/* Agent Action Card */}
                  {msg.agent_action && (
                    <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {msg.agent_action.action === "complete_task" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
                        {msg.agent_action.action === "raise_it_ticket" && <Ticket className="w-4 h-4 text-blue-600" />}
                        {msg.agent_action.action === "book_orientation" && <Calendar className="w-4 h-4 text-purple-600" />}
                        {msg.agent_action.type === "escalation_created" && <ShieldAlert className="w-4 h-4 text-amber-600" />}
                        <span>System Action Result</span>
                      </div>
                      <p className="text-slate-600 text-[11px]">{msg.agent_action.message || msg.agent_action.reason}</p>
                      {msg.agent_action.type === "escalation_created" && onCallAgent && (
                        <div className="pt-1.5">
                          <button
                            type="button"
                            onClick={() => onCallAgent(msg.agent_action?.reason || msg.content)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>Call Assigned Support Agent Now</span>
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Citations Card */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200/80">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                        <span className="flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          Source Citations ({msg.citations.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {msg.citations.map((c, cIdx) => (
                          <div
                            key={cIdx}
                            className="bg-slate-50 hover:bg-slate-100/80 rounded-lg p-2 border border-slate-200 text-[11px] transition-colors"
                          >
                            <div
                              onClick={() => toggleCitationExpand(cIdx)}
                              className="flex items-center justify-between cursor-pointer"
                            >
                              <div className="font-semibold text-slate-800 truncate pr-2">
                                📄 {c.title} {c.section ? `• ${c.section}` : ""}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[9px] font-bold rounded">
                                  {Math.round(c.score * 100)}% match
                                </span>
                                {expandedCitations[cIdx] ? (
                                  <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                )}
                              </div>
                            </div>
                            {expandedCitations[cIdx] && (
                              <p className="mt-2 text-slate-600 text-[10px] leading-relaxed border-t border-slate-200/60 pt-1.5 italic">
                                "{c.snippet}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-slate-400 mt-1 px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}

            {/* Live Streaming Message */}
            {isStreaming && (
              <div className="flex flex-col items-start">
                {streamingRouter && (
                  <div className="flex items-center gap-1.5 mb-1.5 ml-1 animate-fadeIn">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                      <Cpu className="w-3 h-3 animate-spin" /> Routing: {streamingRouter.category}
                    </span>
                  </div>
                )}
                <div className="max-w-[88%] rounded-2xl rounded-bl-xs p-4 bg-white text-slate-900 border border-slate-200 text-xs sm:text-sm shadow-xs">
                  {streamingContent ? (
                    <FormattedMessage content={streamingContent} isUser={false} />
                  ) : (
                    <div className="flex items-center gap-1.5 text-slate-500 py-1">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-dot-1"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-dot-2"></span>
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-dot-3"></span>
                      <span className="text-xs text-slate-400 ml-2">Grounding response from policy handbook...</span>
                    </div>
                  )}

                  {/* Citations Preview During Streaming */}
                  {streamingCitations.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                      <span className="font-semibold text-blue-600">Referencing {streamingCitations.length} policy documents</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-[#12121f] border-t border-white/10">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about policies, benefits, or say 'mark MFA as done'..."
                disabled={isStreaming}
                className="flex-1 px-4 py-2.5 text-xs sm:text-sm bg-white/5 hover:bg-white/10 focus:bg-white/15 rounded-xl border border-white/10 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 outline-none transition-all placeholder:text-white/30 text-white"
              />
              <button
                type="submit"
                disabled={!input.trim() || isStreaming}
                className="p-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-white/10 text-white disabled:text-white/30 rounded-xl transition-all shadow-xs active:scale-95 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
            <div className="flex items-center justify-between text-[10px] text-white/40 px-1 mt-2">
              <span>Azure OpenAI GPT-4o • Grounded in Launch Mate Handbooks</span>
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Online
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
