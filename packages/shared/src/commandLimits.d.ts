export interface CommandTypeCounts {
  chatInput: number;
  user: number;
  message: number;
}

export declare const COMMAND_LIMITS: CommandTypeCounts;

export declare function countCommandsByType(
  payloads: Array<{ type?: number }>,
): CommandTypeCounts;

export declare function assertCommandLimits(
  payloads: Array<{ type?: number }>,
): CommandTypeCounts;
