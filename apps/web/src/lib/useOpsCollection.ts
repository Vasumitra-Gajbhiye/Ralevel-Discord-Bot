"use client";

import { useCallback, useEffect, useState } from "react";

export function useOpsCollection<T extends { _id?: string }>(
  collection: string,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      const res = await fetch(`/api/ops/${collection}?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [collection, q, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function patch(id: string, body: Partial<T>) {
    const res = await fetch(`/api/ops/${collection}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/ops/${collection}/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  }

  async function create(body: Partial<T>) {
    const res = await fetch(`/api/ops/${collection}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    await load();
  }

  return {
    items,
    total,
    loading,
    error,
    q,
    setQ,
    status,
    setStatus,
    load,
    patch,
    remove,
    create,
  };
}
