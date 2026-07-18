import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly message = signal<string>('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(text: string, durationMs = 4000): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.message.set(text);
    this.timer = setTimeout(() => {
      this.message.set('');
      this.timer = null;
    }, durationMs);
  }
}
