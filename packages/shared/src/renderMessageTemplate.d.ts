export interface BanMessagePlaceholder {
  key: string;
  label: string;
  description: string;
  templates: string[];
}

export declare function renderMessageTemplate(
  template: string,
  vars?: Record<string, string | number | null | undefined>,
): string;

export declare const BAN_MESSAGE_PLACEHOLDERS: BanMessagePlaceholder[];
