import { AsyncPipe, DatePipe } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BehaviorSubject,
  catchError,
  of,
  shareReplay,
  switchMap,
} from 'rxjs';
import { ApiService, WhatsAppBroadcast } from '../core/api.service';
import { SchoolRefService } from '../core/school-ref.service';
import { indiaAcademicYearLabel } from '../core/academic-year.util';

@Component({
  selector: 'app-whatsapp',
  standalone: true,
  imports: [AsyncPipe, DatePipe, FormsModule],
  templateUrl: './whatsapp.component.html',
  styleUrl: './pages-shared.scss',
})
export class WhatsappComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly schoolRef = inject(SchoolRefService);
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  className = '';
  message = '';
  smsNumber = '';
  smsMessage = '';
  sending = false;
  error = '';
  info = '';
  tab: 'group' | 'single' | 'due' | 'sms' = 'group';
  dueAcademicYear = indiaAcademicYearLabel();
  /** Placeholders filled on server from Institute Profile (name, phone). */
  dueTemplate =
    'Dear Parent, fee due for {student_name} ({admission_no}) in {class_name} for {academic_year} is Rs {due_amount}. ' +
    'For fee payment / queries contact {school_name} at {school_phone}. Thank you.';

  /** Shown only on Due Fees tab; from Institute Profile for preview. */
  dueProfileHint = '';
  /** From GET /whatsapp/config — real Cloud API vs stub. */
  waModeHint = '';

  ngOnInit(): void {
    this.api.getWhatsAppConfig().subscribe({
      next: (c) => {
        if (c.cloud_configured) {
          this.waModeHint = c.template_mode
            ? `WhatsApp Cloud API on (${c.api_version}) — template mode for new chats.`
            : `WhatsApp Cloud API on (${c.api_version}) — free-text works only inside 24h reply window; add a template for cold messages.`;
        } else {
          this.waModeHint =
            'WhatsApp: stub mode (log only). Set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID in backend .env — use Meta Phone number ID, not 8302095185.';
        }
      },
      error: () => {
        this.waModeHint = '';
      },
    });
    this.api.getInstituteProfile().subscribe({
      next: (p) => {
        const phone = (p.phone || '').trim();
        const name = (p.name || '').trim();
        if (phone || name) {
          this.dueProfileHint = `School line in messages: ${name || '—'} · ${phone || '—'} (edit in Institute Profile).`;
        }
      },
      error: () => {
        /* server still substitutes from DB when sending */
      },
    });
  }

  readonly list$ = this.refresh$.pipe(
    switchMap(() =>
      this.api.listWhatsApp().pipe(
        catchError(() => of<WhatsAppBroadcast[]>([])),
        shareReplay(1)
      )
    )
  );

  send(): void {
    if (!this.className.trim() || !this.message.trim()) {
      this.error = 'Class and message are required.';
      return;
    }
    this.error = '';
    this.info = '';
    this.sending = true;
    if (this.tab === 'group') {
      this.api
        .postWhatsAppGroup({
          class_name: this.className.trim(),
          message: this.message.trim(),
        })
        .pipe(catchError(() => of(null)))
        .subscribe({
          next: (res) => {
            this.sending = false;
            if (!res) {
              this.error = 'Could not queue message. Is the API running?';
              return;
            }
            this.message = '';
            const fc = res.failed_count ?? 0;
            this.info = `Queued ${res.queued_count ?? 0} parent messages${
              (res.skipped_count ?? 0) > 0 ? `, skipped ${res.skipped_count}` : ''
            }${fc > 0 ? `, failed ${fc}` : ''}. Summary: ${res.status}.`;
            this.refresh$.next(undefined);
          },
          error: () => {
            this.sending = false;
            this.error = 'Could not queue message. Is the API running?';
          },
        });
      return;
    }

    this.api
      .postWhatsApp({
        class_name: this.className.trim(),
        message: this.message.trim(),
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (res) => {
          this.sending = false;
          if (!res) {
            this.error = 'Could not queue message. Is the API running?';
            return;
          }
          this.message = '';
          this.info = 'Message queued.';
          this.refresh$.next(undefined);
        },
        error: () => {
          this.sending = false;
          this.error = 'Could not queue message. Is the API running?';
        },
      });
  }

  sendSms(): void {
    if (!this.smsNumber.trim() || !this.smsMessage.trim()) {
      this.error = 'Phone number and message are required.';
      return;
    }
    this.error = '';
    this.info = '';
    this.sending = true;
    this.api
      .postSms({
        phone_number: this.smsNumber.trim(),
        message: this.smsMessage.trim(),
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (out) => {
          this.sending = false;
          if (!out) {
            this.error = 'Could not queue SMS.';
            return;
          }
          if (!String(out.status || '').startsWith('sent_')) {
            this.error = `SMS failed: ${out.status}`;
            return;
          }
          this.info = `SMS sent for ${out.phone_number} (${out.status}).`;
          this.smsMessage = '';
          this.refresh$.next(undefined);
        },
        error: () => {
          this.sending = false;
          this.error = 'Could not queue SMS.';
        },
      });
  }

  sendDueFees(): void {
    if (!this.className.trim() || !this.dueAcademicYear.trim()) {
      this.error = 'Class and academic year are required.';
      return;
    }
    this.error = '';
    this.info = '';
    this.sending = true;
    this.api
      .postWhatsAppDueFees({
        class_name: this.className.trim(),
        academic_year: this.dueAcademicYear.trim(),
        message_template: this.dueTemplate.trim(),
      })
      .pipe(catchError(() => of(null)))
      .subscribe({
        next: (out) => {
          this.sending = false;
          if (!out) {
            this.error = 'Could not queue due-fee reminders.';
            return;
          }
          const f = out.failed_count ?? 0;
          this.info = `Due fee reminders: queued ${out.queued_count}, skipped ${out.skipped_count}${
            f > 0 ? `, failed ${f}` : ''
          }, total due Rs ${out.total_due_sum.toFixed(2)}. Summary: ${out.status}.`;
          this.refresh$.next(undefined);
        },
        error: () => {
          this.sending = false;
          this.error = 'Could not queue due-fee reminders.';
        },
      });
  }

  setTab(next: 'group' | 'single' | 'due' | 'sms'): void {
    this.tab = next;
    this.error = '';
    this.info = '';
  }

  remove(r: WhatsAppBroadcast): void {
    if (!confirm('Delete this broadcast log entry?')) return;
    this.api.deleteWhatsAppBroadcast(r.id).subscribe({
      next: () => this.refresh$.next(),
    });
  }
}
