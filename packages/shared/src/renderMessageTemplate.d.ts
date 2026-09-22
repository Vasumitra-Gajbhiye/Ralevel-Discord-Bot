export interface BanMessagePlaceholder {
  key: string;
  label: string;
  description: string;
  templates: string[];
}

export interface QotdReminderPlaceholder {
  key: string;
  label: string;
  description: string;
}

export declare function renderMessageTemplate(
  template: string,
  vars?: Record<string, string | number | null | undefined>,
): string;

export declare const BAN_MESSAGE_PLACEHOLDERS: BanMessagePlaceholder[];
export declare const MOD_POINTS_PLACEHOLDERS: BanMessagePlaceholder[];
export declare const DEFAULT_QOTD_REMINDER_TEMPLATE: string;
export declare const QOTD_REMINDER_PLACEHOLDERS: QotdReminderPlaceholder[];
