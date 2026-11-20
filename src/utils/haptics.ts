class HapticsEngine {
  private enabled = true;

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public isSupported(): boolean {
    return (
      typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
    );
  }

  private pulse(pattern: number | number[]): void {
    if (!this.enabled || !this.isSupported()) {
      return;
    }
    try {
      navigator.vibrate(pattern);
    } catch {
      // Ignore browsers that block vibration before user gesture
    }
  }

  public tap(): void {
    this.pulse(8);
  }

  public move(): void {
    this.pulse(12);
  }

  public opponentMove(): void {
    this.pulse(8);
  }

  public capture(): void {
    this.pulse([16, 38, 26]);
  }

  public freeMove(): void {
    this.pulse([10, 28, 10]);
  }

  public victory(): void {
    this.pulse([20, 45, 25, 45, 45]);
  }

  public defeat(): void {
    this.pulse([32, 48, 22]);
  }

  public draw(): void {
    this.pulse([18, 40, 18]);
  }
}

export const haptics = new HapticsEngine();
