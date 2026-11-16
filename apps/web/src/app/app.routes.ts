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
  { path: '', loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage), title: 'Vestirse · Probador virtual' },
  { path: 'tienda', component: CatalogPage, title: 'Tienda · Vestirse' },
  { path: 'prenda/:id', loadComponent: () => import('./features/catalog/garment.page').then((m) => m.GarmentPage) },
  { path: 'look', loadComponent: () => import('./features/look/look.page').then((m) => m.LookPage), title: 'Armar look · Vestirse' },
  { path: 'comparar', loadComponent: () => import('./features/comparison/comparison.page').then((m) => m.ComparisonPage), title: 'Comparar · Vestirse' },
  { path: 'carrito', loadComponent: () => import('./features/cart/cart.page').then((m) => m.CartPage), title: 'Bolsa · Vestirse' },
  { path: 'favoritos', loadComponent: () => import('./features/favorites/favorites.page').then((m) => m.FavoritesPage), title: 'Mis favoritos · Vestirse' },
  { path: 'cuenta', loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage), title: 'Cuenta · Vestirse' },
  { path: 'privacidad', loadComponent: () => import('./features/privacy/privacy.page').then((m) => m.PrivacyPage), title: 'Privacidad · Vestirse' },
  { path: 'creditos', loadComponent: () => import('./features/credits/credits.page').then((m) => m.CreditsPage), title: 'Créditos de fotos · Vestirse' },
  { path: 'admin', canMatch: [adminOnly], loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage), title: 'Admin · Vestirse' },
  { path: '**', redirectTo: '' },
];
