"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  async function getToken() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data.session?.access_token;
    if (!token) throw new Error("Sem sessão. Faça login novamente.");
    return token;
  }

  async function handlePreview() {
    setResult(null);
    setPreview(null);

    if (!file) {
      setResult({ ok: false, error: "Selecione um arquivo CSV." });
      return;
    }

    setLoading(true);

    try {
      const token = await getToken();

      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");

      const res = await fetch("/api/import/profit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const json = await res.json();
      setPreview(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;

    setLoading(true);

    try {
      const token = await getToken();

      const form = new FormData();
      form.append("file", file);
      form.append("mode", "import");

      const res = await fetch("/api/import/profit", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: form,
      });

      const json = await res.json();
      setResult(json);
    } catch (e: any) {
      setResult({ ok: false, error: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <h1 className="text-2xl font-semibold">Importar CSV (Profit)</h1>

      <div className="space-y-3">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setPreview(null);
            setResult(null);
          }}
        />

        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
          >
            {loading ? "Processando..." : "Preview"}
          </button>

          {preview?.ok && preview.mode === "preview" && (
            <button
              onClick={handleImport}
              disabled={loading}
              className="px-4 py-2 rounded bg-black text-white"
            >
              Confirmar Importação
            </button>
          )}
        </div>
      </div>

      {/* Preview */}
      {preview?.ok && preview.mode === "preview" && (
        <div className="space-y-4">
          <div className="bg-gray-100 p-4 rounded">
            <p><strong>Data relatório:</strong> {preview.report_date}</p>
            <p><strong>Total de operações:</strong> {preview.total_rows}</p>
          </div>

          <div className="overflow-auto border rounded">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-200">
                <tr>
                  <th className="p-2 text-left">Data</th>
                  <th className="p-2 text-left">Ativo</th>
                  <th className="p-2 text-left">Lado</th>
                  <th className="p-2 text-left">Qtd</th>
                  <th className="p-2 text-left">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.map((row: any, i: number) => (
                  <tr key={i} className="border-t">
                    <td className="p-2">{row.trade_date}</td>
                    <td className="p-2">{row.asset}</td>
                    <td className="p-2">{row.side}</td>
                    <td className="p-2">{row.qty}</td>
                    <td className="p-2">{row.result_brl}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Resultado final */}
      {result && (
        <pre className="p-4 bg-gray-100 rounded text-sm overflow-auto">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}