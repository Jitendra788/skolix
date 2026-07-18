import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideRouter } from '@angular/router';
import { provideQuillConfig } from 'ngx-quill/config';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideAnimationsAsync(),
    provideRouter(routes),
    provideHttpClient(),
    provideQuillConfig({
      theme: 'snow',
      sanitize: true,
      modules: {
        toolbar: [['bold', 'italic'], [{ list: 'ordered' }, { list: 'bullet' }]],
      },
    }),
  ],
};
