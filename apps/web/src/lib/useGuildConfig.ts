"use client";

import { useCallback, useEffect, useState } from "react";

export type GuildConfigData = {
  guildId: string;
  roles: { key: string; label: string; roleId: string }[];
  commandPermissions: Record<string, string[]>;
  channels: { key: string; label: string; channelId: string }[];
  categories: { key: string; label: string; categoryId: string }[];
  features: Record<string, boolean>;
  reputation: {
    tiers: { roleKey: string; threshold: number; label: string }[];
    thankWords: string[];
    welcomeWords: string[];
    disabledChannels: { id: string; label: string }[];
    disabledCategories: { id: string; label: string }[];
  };
  ranks: {
    ladder: { roleKey: string; xp: number; name: string }[];
    levelUpChannelKey: string;
    boosterRoleKey: string;
    boosterMultiplier: number;
  };
  schedules: { finalizeHourIst: number; qotdHourIst: number };
  welcome: {
    title: string;
    description: string;
    color: string;
    avatarSize: number;
    avatarX: number;
    avatarY: number;
  };
  certificates: {
    types: {
      id: string;
      label: string;
      enabled: boolean;
      requiredRoleKeys: string[];
      rewardRoleKey: string | null;
    }[];
    modRoleKeys: string[];
    extraModRoleIds: string[];
    panel: {
      channelId: string;
      panelMessageId: string | null;
      title: string;
      description: string;
      color: string;
      footer: string;
      showTimestamp: boolean;
      buttons: {
        certTypeId: string;
        label: string;
        style: "Primary" | "Secondary" | "Success" | "Danger";
      }[];
    };
  };
  confessions: {
    modChannelKey: string;
    ventChannelKey: string;
    approverRoleKeys: string[];
  };
  tasks: {
    teams: {
      id: string;
      label: string;
      channelKey: string;
      allowedRoleKeys: string[];
    }[];
  };
  polls: {
    breakdownRoleKeys: string[];
    minOptions: number;
    maxOptions: number;
  };
  sticky: { defaultLineThreshold: number };
  helper: { pingDelayMs: number };
  updatedAt?: string;
};

export function useGuildConfig() {
  const [config, setConfig] = useState<GuildConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConfig(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (patch: Partial<GuildConfigData>) => {
    setSaving(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setConfig(data);
      setStatus("Saved. Restart the bot for settings to apply.");
      return data as GuildConfigData;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      throw e;
    } finally {
      setSaving(false);
    }
  }, []);

  return { config, setConfig, loading, error, saving, status, save, reload: load };
}
