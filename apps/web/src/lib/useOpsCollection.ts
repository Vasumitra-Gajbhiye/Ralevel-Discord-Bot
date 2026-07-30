"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type UseOpsCollectionOptions = {
  pageSize?: number;
  initialSort?: string;
  initialOrder?: "asc" | "desc";
};

export function useOpsCollection<T extends { _id?: string }>(
  collection: string,
  options?: UseOpsCollectionOptions,
) {
  const pageSize = options?.pageSize;
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState(options?.initialSort ?? "");
  const [order, setOrder] = useState<"asc" | "desc">(
    options?.initialOrder ?? "desc",
  );
  const [xpMin, setXpMin] = useState("");
  const [xpMax, setXpMax] = useState("");
  const [messagesMin, setMessagesMin] = useState("");
  const [messagesMax, setMessagesMax] = useState("");
  const [page, setPage] = useState(1);
  const prevFilters = useRef({
    q,
    status,
    sort,
    order,
    xpMin,
    xpMax,
    messagesMin,
    messagesMax,
  });

  useEffect(() => {
    const prev = prevFilters.current;
    if (
      prev.q !== q ||
      prev.status !== status ||
      prev.sort !== sort ||
      prev.order !== order ||
      prev.xpMin !== xpMin ||
      prev.xpMax !== xpMax ||
      prev.messagesMin !== messagesMin ||
      prev.messagesMax !== messagesMax
    ) {
      prevFilters.current = {
        q,
        status,
        sort,
        order,
        xpMin,
        xpMax,
        messagesMin,
        messagesMax,
      };
      setPage(1);
    }
  }, [q, status, sort, order, xpMin, xpMax, messagesMin, messagesMax]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const limit = pageSize ? String(pageSize) : "100";
      const params = new URLSearchParams({ limit });
      if (pageSize) {
        params.set("skip", String((page - 1) * pageSize));
      }
      if (q) params.set("q", q);
      if (status) params.set("status", status);
      if (sort) {
        params.set("sort", sort);
        params.set("order", order);
      }
      if (xpMin) params.set("xpMin", xpMin);
      if (xpMax) params.set("xpMax", xpMax);
      if (messagesMin) params.set("messagesMin", messagesMin);
      if (messagesMax) params.set("messagesMax", messagesMax);
      const res = await fetch(`/api/ops/${collection}?${params}`);
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const nextTotal = data.total || 0;
      setItems(data.items || []);
      setTotal(nextTotal);

      if (pageSize && nextTotal > 0) {
        const lastPage = Math.max(1, Math.ceil(nextTotal / pageSize));
        if (page > lastPage) {
          setPage(lastPage);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [
    collection,
    q,
    status,
    sort,
    order,
    xpMin,
    xpMax,
    messagesMin,
    messagesMax,
    page,
    pageSize,
  ]);

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
    sort,
    setSort,
    order,
    setOrder,
    xpMin,
    setXpMin,
    xpMax,
    setXpMax,
    messagesMin,
    setMessagesMin,
    messagesMax,
    setMessagesMax,
    page,
    setPage,
    pageSize,
    load,
    patch,
    remove,
    create,
  };
}
