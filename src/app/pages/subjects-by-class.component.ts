import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { ApiService, ClassSubjectsOverviewRow } from '../core/api.service';

@Component({
  selector: 'app-subjects-by-class',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './subjects-by-class.component.html',
  styleUrls: ['./pages-shared.scss', './subjects-by-class.component.scss'],
})
export class SubjectsByClassComponent implements OnInit {
  private readonly api = inject(ApiService);

  overview: ClassSubjectsOverviewRow[] = [];
  err = '';

  ngOnInit(): void {
    this.api
      .listSubjectsByClassOverview()
      .pipe(catchError(() => of([])))
      .subscribe({
        next: (o) => (this.overview = o),
        error: () => (this.err = 'Could not load subjects.'),
      });
  }
}
