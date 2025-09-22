import { useState } from "react";
import { setProToken, FREE_LIMIT } from "../entitlements"; // Pfad anpassen, falls Datei in src/ liegt: "./entitlements"

export default function PaywallRC({ onClose }) {
  const [busy, setBusy] = useState(false);

  function goProTest() {
    setBusy(true);
    // Test-Freischaltung (nur lokal). Für App Stores ersetzen wir das später durch RevenueCat.
    setProToken("local-test");
    setTimeout(() => { setBusy(false); onClose?.(); window.location.reload(); }, 200);
  }

  return (
    <div className="fixed inset-0 grid place-items-center bg-black/50 p-4 z-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 space-y-3">
        <h2 className="text-xl font-bold">Werde Pro – 9,99 €/Monat</h2>
        <p className="text-sm text-gray-600">
          Unbegrenzte Artikel, Export & mehrere Standorte (Free-Limit: {FREE_LIMIT})
        </p>
        <div className="flex gap-2 justify-end">
          <button className="px-4 py-2 rounded-xl bg-gray-200" onClick={onClose} disabled={busy}>Später</button>
          <button className="px-4 py-2 rounded-2xl bg-slate-900 text-white" onClick={goProTest} disabled={busy}>
            {busy ? "Aktiviere…" : "Jetzt freischalten (Test)"}
          </button>
        </div>
        <p className="text-xs text-gray-500">Hinweis: nur Test. Store-Kauf bauen wir später mit RevenueCat ein.</p>
      </div>
    </div>
  );
}
