import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.105.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  const authHeader = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!authHeader || !supabaseUrl || !supabaseAnonKey) return json({ error: "Authentification indisponible." }, 401);
  if (!geminiKey) return json({ error: "La clé GEMINI_API_KEY doit être configurée dans les secrets Supabase." }, 503);

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: "Session invalide. Reconnecte-toi." }, 401);

  let body: { messages?: Array<{ role: string; content: string }> };
  try { body = await req.json(); } catch { return json({ error: "Corps de requête invalide." }, 400); }
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > 24) {
    return json({ error: "La conversation est vide ou trop longue pour cette requête." }, 400);
  }

  const contents = body.messages.map((item) => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") {
      throw new Error("Message invalide.");
    }
    return { role: item.role === "assistant" ? "model" : "user", parts: [{ text: item.content.slice(0, 12000) }] };
  });
  if (contents[contents.length - 1].role !== "user") return json({ error: "Le dernier message doit venir de l’utilisateur." }, 400);

  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: "Tu es Yvan.IA, un assistant intelligent, chaleureux, créatif et fiable. Réponds en français par défaut, de façon claire et utile. Adapte la longueur à la demande. N’invente pas de faits et signale les incertitudes. Tu peux aider à apprendre, créer, coder et organiser des projets." }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 4096 },
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      console.error("Gemini API error", response.status, result?.error?.message);
      return json({ error: "Gemini n’a pas pu répondre. Vérifie la clé API et les limites de ton compte Google AI." }, 502);
    }
    const reply = result?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || "").join("").trim();
    if (!reply) return json({ error: "Gemini a renvoyé une réponse vide." }, 502);
    return json({ reply });
  } catch (error) {
    console.error("Yvan chat error", error);
    return json({ error: "Impossible de contacter Gemini pour le moment." }, 500);
  }
});