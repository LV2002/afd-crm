export interface Finding {
  readonly code: string;
  readonly severity: 'blocking' | 'advisory';
  readonly message: string;
}

export const blocking = (code: string, message: string): Finding => ({ code, severity: 'blocking', message });
export const advisory = (code: string, message: string): Finding => ({ code, severity: 'advisory', message });
