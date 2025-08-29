import React, { useEffect, useMemo, useRef, useState } from "react";

// =========================================
// MHD-Tracker – Single-file React App
// - Erfasst Produkte inkl. MHD
// - Markiert "Bald ablaufend" und "Abgelaufen"
// - Lokale Speicherung via localStorage (kein Server nötig)
// - Desktop-Benachrichtigungen (optional, per Browser-Permission)
// - Suche/Filter/Sortierung, Editieren/Löschen
// - Export/Import (JSON)
// =========================================

// ---- Utility helpers ----
const STORAGE_KEY = "mhd_tracker_items_v1";
const SETTINGS_KEY = "mhd_tracker_settings_v1";
const NOTIFIED_KEY = "mhd_tracker_notified_v1";

function uid() {
  return (
    Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
  ).toUpperCase();
}

function formatDateISO(d) {
  if (!d) return "";
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(a, b) {
  const ms = 1000 * 60 * 60 * 24;
  const da = new Date(a);
  const db = new Date(b);
  return Math.floor((db.setHours(0,0,0,0) - da.setHours(0,0,0,0)) / ms);
}

function todayISO() {
  return formatDateISO(new Date());
}

function classNames(...xs) {
  return xs.filter(Boolean).join(" ");
}

// ---- Local storage hooks ----
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : initialValue;
  });
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);
  return [value, setValue];
}

// ---- Notification helper ----
async function requestNotifyPermission() {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "default") {
    try { return await Notification.requestPermission(); } catch { return "denied"; }
  }
  return Notification.permission;
}

function sendNotification(title, body) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "granted") {
    try { new Notification(title, { body }); } catch {}
  }
}

// ---- Main App ----
export default function App() {
  const [items, setItems] = useLocalStorage(STORAGE_KEY, []);
  const [settings, setSettings] = useLocalStorage(SETTINGS_KEY, {
    soonDays: 7, // Schwelle „bald ablaufend“
    notifySoon: true,
    notifyExpired: true,
  });
  const [notified, setNotified] = useLocalStorage(NOTIFIED_KEY, {}); // { [id]: { soon: true, expired: true } }

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | ok | soon | expired
  const [sortBy, setSortBy] = useState("mhdAsc"); // nameAsc | nameDesc | mhdAsc | mhdDesc | daysAsc | daysDesc

  const [form, setForm] = useState({
    id: "",
    name: "",
    sku: "",
    category: "",
    supplier: "",
    lot: "",
    quantity: 1,
    received: todayISO(),
    mhd: "",
  });

  const fileInputRef = useRef(null);

  // Derived: annotate status
  const annotated = useMemo(() => {
    const now = todayISO();
    return items.map((it) => {
      const d = it.mhd ? daysBetween(now, it.mhd) : Infinity;
      let status = "ok";
      if (isFinite(d)) {
        if (d < 0) status = "expired";
        else if (d <= settings.soonDays) status = "soon";
      }
      return { ...it, daysLeft: d, status };
    });
  }, [items, settings.soonDays]);

  // Filter & search
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let arr = annotated.filter((it) => {
      if (filter !== "all" && it.status !== filter) return false;
      if (!q) return true;
      return [it.name, it.sku, it.category, it.supplier, it.lot]
        .filter(Boolean)
        .some((s) => s.toLowerCase().includes(q));
    });
    switch (sortBy) {
      case "nameAsc": arr.sort((a,b)=>a.name.localeCompare(b.name)); break;
      case "nameDesc": arr.sort((a,b)=>b.name.localeCompare(a.name)); break;
      case "mhdAsc": arr.sort((a,b)=>new Date(a.mhd)-new Date(b.mhd)); break;
      case "mhdDesc": arr.sort((a,b)=>new Date(b.mhd)-new Date(a.mhd)); break;
      case "daysAsc": arr.sort((a,b)=>a.daysLeft-b.daysLeft); break;
      case "daysDesc": arr.sort((a,b)=>b.daysLeft-a.daysLeft); break;
      default: break;
    }
    return arr;
  }, [annotated, filter, query, sortBy]);

  // Request notification permission on first load
  useEffect(() => {
    requestNotifyPermission();
  }, []);

  // Periodic check every 30 seconds while App ist offen
  useEffect(() => {
    const check = () => {
      const now = todayISO();
      annotated.forEach((it) => {
        const d = it.daysLeft;
        if (!isFinite(d)) return;
        const entry = notified[it.id] || {};
        if (settings.notifyExpired && d < 0 && !entry.expired) {
          sendNotification("Abgelaufen", `${it.name} (MHD ${it.mhd}) ist abgelaufen.`);
          setNotified((prev) => ({ ...prev, [it.id]: { ...prev[it.id], expired: true } }));
        } else if (settings.notifySoon && d >= 0 && d <= settings.soonDays && !entry.soon) {
          sendNotification("Bald ablaufend", `${it.name} läuft in ${d} Tag(en) ab (MHD ${it.mhd}).`);
          setNotified((prev) => ({ ...prev, [it.id]: { ...prev[it.id], soon: true } }));
        }
      });
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [annotated, notified, settings.notifySoon, settings.notifyExpired, settings.soonDays, setNotified]);

  function resetForm() {
    setForm({ id: "", name: "", sku: "", category: "", supplier: "", lot: "", quantity: 1, received: todayISO(), mhd: "" });
  }

  function submitForm(e) {
    e.preventDefault();
    if (!form.name || !form.mhd) {
      alert("Bitte mindestens Name und MHD angeben.");
      return;
    }
    const record = {
      id: form.id || uid(),
      name: form.name.trim(),
      sku: form.sku.trim(),
      category: form.category.trim(),
      supplier: form.supplier.trim(),
      lot: form.lot.trim(),
      quantity: Number(form.quantity) || 1,
      received: form.received || todayISO(),
      mhd: form.mhd,
    };
    setItems((prev) => {
      const exists = prev.some((x) => x.id === record.id);
      const next = exists ? prev.map((x) => (x.id === record.id ? record : x)) : [...prev, record];
      return next;
    });
    setNotified((prev) => ({ ...prev, [record.id]: {} })); // Reset Benachrichtigt-Status bei Update
    resetForm();
  }

  function editItem(it) {
    setForm({ ...it });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteItem(id) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    setItems((prev) => prev.filter((x) => x.id !== id));
    setNotified((prev) => {
      const { [id]: _, ...rest } = prev; return rest;
    });
  }

  function exportJSON() {
    const blob = new Blob([JSON.stringify({ items, settings }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mhd-tracker-export-${todayISO()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  function importJSON(ev) {
    const file = ev.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (Array.isArray(obj.items)) setItems(obj.items);
        if (obj.settings) setSettings(obj.settings);
        alert("Import erfolgreich.");
      } catch {
        alert("Import fehlgeschlagen – ungültige Datei.");
      }
    };
    reader.readAsText(file);
    ev.target.value = ""; // reset
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold">MHD-Tracker</h1>
            <p className="text-sm text-slate-600">Produkte erfassen, Mindesthaltbarkeitsdaten überwachen & Benachrichtigungen erhalten.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportJSON} className="px-3 py-2 rounded-2xl shadow bg-white hover:bg-slate-100">Export</button>
            <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importJSON} />
            <button onClick={() => fileInputRef.current?.click()} className="px-3 py-2 rounded-2xl shadow bg-white hover:bg-slate-100">Import</button>
          </div>
        </header>

        {/* Einstellungen */}
        <section className="mb-6">
          <div className="grid md:grid-cols-3 gap-3">
            <div className="p-4 bg-white rounded-2xl shadow">
              <label className="text-sm font-medium">Schwelle „bald ablaufend“ (Tage)</label>
              <input type="number" min={1} value={settings.soonDays}
                onChange={(e)=>setSettings((s)=>({...s, soonDays: Math.max(1, Number(e.target.value)||1)}))}
                className="mt-1 w-full border rounded-xl p-2" />
            </div>
            <div className="p-4 bg-white rounded-2xl shadow flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Benachrichtigung – Bald ablaufend</div>
                <div className="text-xs text-slate-500">Desktop-Notification senden</div>
              </div>
              <input type="checkbox" checked={settings.notifySoon}
                onChange={(e)=>setSettings((s)=>({...s, notifySoon: e.target.checked}))} />
            </div>
            <div className="p-4 bg-white rounded-2xl shadow flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Benachrichtigung – Abgelaufen</div>
                <div className="text-xs text-slate-500">Desktop-Notification senden</div>
              </div>
              <input type="checkbox" checked={settings.notifyExpired}
                onChange={(e)=>setSettings((s)=>({...s, notifyExpired: e.target.checked}))} />
            </div>
          </div>
        </section>

        {/* Formular */}
        <section className="mb-6">
          <form onSubmit={submitForm} className="grid md:grid-cols-4 gap-3 bg-white p-4 rounded-2xl shadow">
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Artikelname *</label>
              <input className="w-full border rounded-xl p-2 mt-1" placeholder="z.B. Sandwich Chicken"
                value={form.name} onChange={(e)=>setForm((f)=>({...f, name: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">SKU / EAN</label>
              <input className="w-full border rounded-xl p-2 mt-1" value={form.sku}
                onChange={(e)=>setForm((f)=>({...f, sku: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">Kategorie</label>
              <input className="w-full border rounded-xl p-2 mt-1" placeholder="Kühlware, Snacks…" value={form.category}
                onChange={(e)=>setForm((f)=>({...f, category: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">Lieferant</label>
              <input className="w-full border rounded-xl p-2 mt-1" value={form.supplier}
                onChange={(e)=>setForm((f)=>({...f, supplier: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">Charge / LOT</label>
              <input className="w-full border rounded-xl p-2 mt-1" value={form.lot}
                onChange={(e)=>setForm((f)=>({...f, lot: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">Menge</label>
              <input type="number" min={1} className="w-full border rounded-xl p-2 mt-1" value={form.quantity}
                onChange={(e)=>setForm((f)=>({...f, quantity: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">Wareneingang</label>
              <input type="date" className="w-full border rounded-xl p-2 mt-1" value={form.received}
                onChange={(e)=>setForm((f)=>({...f, received: e.target.value}))} />
            </div>
            <div>
              <label className="text-sm font-medium">MHD *</label>
              <input type="date" className="w-full border rounded-xl p-2 mt-1" value={form.mhd}
                onChange={(e)=>setForm((f)=>({...f, mhd: e.target.value}))} />
            </div>
            <div className="md:col-span-4 flex gap-2">
              <button type="submit" className="px-4 py-2 rounded-2xl bg-slate-900 text-white shadow hover:bg-slate-800">
                {form.id ? "Eintrag aktualisieren" : "Eintrag hinzufügen"}
              </button>
              {form.id && (
                <button type="button" onClick={resetForm} className="px-4 py-2 rounded-2xl bg-white shadow hover:bg-slate-100">
                  Abbrechen
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Toolbar: Suche/Filter/Sortierung */}
        <section className="mb-2 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <div className="flex gap-2">
            <input placeholder="Suche: Name, SKU, Kategorie, Lieferant…" value={query}
              onChange={(e)=>setQuery(e.target.value)}
              className="border rounded-2xl px-3 py-2 w-full md:w-96 bg-white shadow" />
            <select value={filter} onChange={(e)=>setFilter(e.target.value)} className="border rounded-2xl px-3 py-2 bg-white shadow">
              <option value="all">Alle</option>
              <option value="ok">OK</option>
              <option value="soon">Bald ablaufend</option>
              <option value="expired">Abgelaufen</option>
            </select>
            <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} className="border rounded-2xl px-3 py-2 bg-white shadow">
              <option value="mhdAsc">MHD ↑</option>
              <option value="mhdDesc">MHD ↓</option>
              <option value="daysAsc">Tage übrig ↑</option>
              <option value="daysDesc">Tage übrig ↓</option>
              <option value="nameAsc">Name A–Z</option>
              <option value="nameDesc">Name Z–A</option>
            </select>
          </div>
          <div className="text-sm text-slate-600">{filtered.length} Einträge</div>
        </section>

        {/* Tabelle */}
        <section className="overflow-x-auto">
          <table className="min-w-full bg-white rounded-2xl shadow overflow-hidden">
            <thead className="bg-slate-100">
              <tr className="text-left text-sm">
                <th className="p-3">Status</th>
                <th className="p-3">Artikel</th>
                <th className="p-3">SKU</th>
                <th className="p-3">Kategorie</th>
                <th className="p-3">Lieferant</th>
                <th className="p-3">LOT</th>
                <th className="p-3">Menge</th>
                <th className="p-3">Wareneingang</th>
                <th className="p-3">MHD</th>
                <th className="p-3">Tage</th>
                <th className="p-3">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="border-t text-sm hover:bg-slate-50">
                  <td className="p-3">
                    <span className={classNames(
                      "px-2 py-1 rounded-2xl text-xs font-semibold",
                      it.status === "ok" && "bg-emerald-100 text-emerald-800",
                      it.status === "soon" && "bg-amber-100 text-amber-800",
                      it.status === "expired" && "bg-rose-100 text-rose-800"
                    )}>
                      {it.status === "ok" && "OK"}
                      {it.status === "soon" && "Bald ablaufend"}
                      {it.status === "expired" && "Abgelaufen"}
                    </span>
                  </td>
                  <td className="p-3 font-medium">{it.name}</td>
                  <td className="p-3">{it.sku}</td>
                  <td className="p-3">{it.category}</td>
                  <td className="p-3">{it.supplier}</td>
                  <td className="p-3">{it.lot}</td>
                  <td className="p-3">{it.quantity}</td>
                  <td className="p-3 whitespace-nowrap">{it.received}</td>
                  <td className="p-3 whitespace-nowrap">{it.mhd}</td>
                  <td className={classNames("p-3 font-semibold", it.daysLeft < 0 ? "text-rose-700" : it.daysLeft <= settings.soonDays ? "text-amber-700" : "text-emerald-700")}>{isFinite(it.daysLeft) ? it.daysLeft : "—"}</td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button onClick={()=>editItem(it)} className="px-2 py-1 rounded-xl bg-white border shadow text-slate-700">Bearb.</button>
                      <button onClick={()=>deleteItem(it.id)} className="px-2 py-1 rounded-xl bg-white border shadow text-rose-700">Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-slate-500">Keine Einträge gefunden.</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {/* Hinweise */}
        <footer className="mt-8 text-xs text-slate-500 space-y-2">
          <p>Hinweis: Daten werden nur lokal in deinem Browser gespeichert (localStorage). Für Team-Nutzung über mehrere Kassen/PCs wäre eine Server- oder Cloud-Variante nötig.</p>
          <p>Benachrichtigungen funktionieren nur, wenn die Seite geöffnet ist und du die Browser-Permission erteilt hast. Für Hintergrund-Reminders wäre ein Service Worker/Server nötig.</p>
        </footer>
      </div>
    </div>
  );
}

