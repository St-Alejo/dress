import { inject } from '@angular/core';
import { Router, type CanMatchFn, type Routes } from '@angular/router';
import { AuthStore } from './core/auth.store';
import { CatalogPage } from './features/catalog/catalog.page';

const adminOnly: CanMatchFn = async () => {
  const auth = inject(AuthStore);
  if (!auth.loaded()) await auth.refresh();
  return auth.isAdmin() || inject(Router).parseUrl('/cuenta');
};

export const routes: Routes = [
  { path: '', component: CatalogPage, title: 'Vestirse' },
  { path: 'prenda/:id', loadComponent: () => import('./features/catalog/garment.page').then((m) => m.GarmentPage) },
  { path: 'comparar', loadComponent: () => import('./features/comparison/comparison.page').then((m) => m.ComparisonPage), title: 'Comparar · Vestirse' },
  { path: 'cuenta', loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage), title: 'Cuenta · Vestirse' },
  { path: 'privacidad', loadComponent: () => import('./features/privacy/privacy.page').then((m) => m.PrivacyPage), title: 'Privacidad · Vestirse' },
  { path: 'admin', canMatch: [adminOnly], loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage), title: 'Admin · Vestirse' },
  { path: '**', redirectTo: '' },
];
