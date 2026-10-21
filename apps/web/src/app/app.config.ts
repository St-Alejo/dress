import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { Router, type ViewTransitionInfo, provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { errorInterceptor } from './core/http/error.interceptor';
import { provideI18n } from './core/i18n';

/** Transición suave entre páginas, pero no al actualizar la URL de la misma página (filtros, look). */
function skipInPlaceUpdates({ transition }: ViewTransitionInfo) {
  if (!inject(Router).currentNavigation()?.extras.replaceUrl) return;
  // Cambios en la misma página (filtros, look): sin animación. No se usa skipTransition()
  // porque Angular registra en consola el AbortError que produce.
  const root = document.documentElement;
  root.classList.add('vt-instant');
  transition.finished.finally(() => root.classList.remove('vt-instant')).catch(() => undefined);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([errorInterceptor])),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' }), withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated: skipInPlaceUpdates })),
    provideI18n(),
    provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' }),
  ],
};
