// All time logic receives a Clock; nothing reads the machine date directly (CLAUDE.md rule 9).
export interface Clock {
  now(): Date;
}

export class FakeClock implements Clock {
  private current: Date;

  constructor(iso: string) {
    this.current = new Date(iso);
  }

  now(): Date {
    return new Date(this.current);
  }

  advanceMinutes(minutes: number): void {
    this.current = new Date(this.current.getTime() + minutes * 60_000);
  }
}
