"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "../../../lib/supabase";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function handleAuthCallback() {
      try {
        // Exchange auth code or verify session from URL
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (session?.user) {
          // Sync / upsert profile in Supabase table
          const meta = session.user.user_metadata || {};
          const full_name = meta.full_name || meta.name || session.user.email?.split("@")[0] || "Launch Mate Employee";
          const role = meta.role || "Software Engineer";
          const work_location = meta.work_location || meta.location || "Redmond, WA";
          const department = meta.department || "Engineering";

          // Also provision/sync into FastAPI backend database so personalized tasks & RAG are ready
          try {
            const providerName = session.user.app_metadata?.provider === "azure" ? "microsoft" : "google";
            const apiRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/auth/oauth`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                provider: providerName,
                email: session.user.email,
                full_name,
                role,
                department,
                location: work_location
              })
            });
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              if (apiData.access_token && typeof window !== "undefined") {
                localStorage.setItem("launchmate_auth_token", apiData.access_token);
                localStorage.setItem("launchmate_user_id", apiData.user.id);
              }
            }
          } catch (backendErr) {
            console.warn("Backend OAuth sync notice:", backendErr);
          }

          if (mounted) {
            router.replace("/");
          }
        } else {
          // If session is still propagating through onAuthStateChange
          const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
            if (currentSession?.user && mounted) {
              const meta = currentSession.user.user_metadata || {};
              const full_name = meta.full_name || meta.name || currentSession.user.email?.split("@")[0] || "Launch Mate Employee";
              const role = meta.role || "Software Engineer";
              const work_location = meta.work_location || meta.location || "Redmond, WA";
              const department = meta.department || "Engineering";

              try {
                const providerName = currentSession.user.app_metadata?.provider === "azure" ? "microsoft" : "google";
                const apiRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1"}/auth/oauth`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    provider: providerName,
                    email: currentSession.user.email,
                    full_name,
                    role,
                    department,
                    location: work_location
                  })
                });
                if (apiRes.ok) {
                  const apiData = await apiRes.json();
                  if (apiData.access_token && typeof window !== "undefined") {
                    localStorage.setItem("launchmate_auth_token", apiData.access_token);
                    localStorage.setItem("launchmate_user_id", apiData.user.id);
                  }
                }
              } catch (e) {
                console.warn("Async OAuth sync notice:", e);
              }

              subscription.unsubscribe();
              router.replace("/");
            }
          });

          // Timeout fallback in case OAuth was cancelled or failed
          setTimeout(() => {
            if (mounted) {
              router.replace("/");
            }
          }, 4000);
        }
      } catch (err: any) {
        console.error("OAuth callback error:", err);
        if (mounted) {
          setError(err.message || "Failed to finalize OAuth sign in.");
          setTimeout(() => router.replace("/"), 4000);
        }
      }
    }

    handleAuthCallback();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-xl border border-slate-200 text-center space-y-4">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md">
          <Sparkles className="w-7 h-7 text-amber-300 animate-pulse" />
        </div>

        {error ? (
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
            <p className="text-xs text-slate-500">Redirecting back to dashboard...</p>
          </div>
        ) : (
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Authenticating with Launch Mate</h2>
            <p className="text-xs text-slate-500">
              Verifying credentials, linking your corporate profile, and preparing your onboarding workspace...
            </p>
            <div className="pt-4 flex items-center justify-center gap-1.5 text-blue-600">
              <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
              <span className="text-xs font-semibold">Redirecting to Dashboard</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
