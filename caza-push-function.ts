// ============================================================
//  CAZA — push sender  (Supabase Edge Function)
//  Name it:  caza-push
//  Paste this whole file into the function editor in the Supabase
//  dashboard, set the three secrets (see the setup notes), Deploy.
//
//  It's called by database webhooks whenever a new row lands in
//  messages, notes, or play. It figures out who the "other" person
//  in the pair is and sends them a push.
// ============================================================
import webpush from "https://esm.sh/web-push@3.6.7";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("PROJECT_URL")!;
const SERVICE_ROLE      = Deno.env.get("SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC      = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE     = Deno.env.get("VAPID_PRIVATE")!;

webpush.setVapidDetails("mailto:caza@caza-app.net", VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row = payload.record;                 // the new row
    const table = payload.table;                 // messages | notes | play
    if (!row) return new Response("no row", { status: 200 });

    // work out the pair, the sender, and the notification text
    let pairId: string | null = null;
    let sender: string | null = null;
    let title = "Caza";
    let body = "";
    let url = "/";

    if (table === "messages") {
      pairId = row.pair_id; sender = row.sender;
      body = row.body?.length > 80 ? row.body.slice(0, 79) + "\u2026" : (row.body || "New message");
      url = "/";
    } else if (table === "notes") {
      pairId = row.pair_id; sender = row.updated_by;
      body = "Your friend updated a note";
      url = "/";
    } else if (table === "play") {
      pairId = row.pair_id; sender = null;        // play has no single sender column
      body = "Your friend made a move";
      url = "/";
    } else {
      return new Response("ignored", { status: 200 });
    }
    if (!pairId) return new Response("no pair", { status: 200 });

    // Look up the partner's subscriptions. For messages/notes we have the
    // sender, so we notify the OTHER person. For play we can't tell who moved,
    // so we notify BOTH members except any device that... we just notify both.
    let subs: any[] = [];
    if (sender) {
      const { data } = await admin.rpc("partner_subs", { p_pair: pairId, p_sender: sender });
      subs = data || [];
    } else {
      // notify everyone in the pair (both people) for play events
      const { data: pr } = await admin.from("pairs").select("user_a,user_b").eq("id", pairId).single();
      if (pr) {
        const ids = [pr.user_a, pr.user_b].filter(Boolean);
        const { data } = await admin.from("push_subs").select("endpoint,p256dh,auth").in("user_id", ids);
        subs = data || [];
      }
    }

    const notif = JSON.stringify({ title, body, url, tag: table + "-" + pairId });

    await Promise.all(subs.map(async (s: any) => {
      const subscription = { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } };
      try {
        await webpush.sendNotification(subscription, notif);
      } catch (err: any) {
        // 404/410 = subscription is dead; clean it up
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subs").delete().eq("endpoint", s.endpoint);
        }
      }
    }));

    return new Response(JSON.stringify({ sent: subs.length }), {
      headers: { "Content-Type": "application/json" }, status: 200,
    });
  } catch (e) {
    return new Response("error: " + (e as Error).message, { status: 200 });
  }
});
