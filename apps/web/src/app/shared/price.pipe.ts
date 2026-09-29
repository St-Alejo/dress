import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

@Pipe({ name: 'price', pure: false })
export class PricePipe implements PipeTransform {
  private readonly t = inject(TranslocoService);

  transform(cents: number): string {
    const locale = this.t.getActiveLang() === 'en' ? 'en-US' : 'es-CO';
    return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(cents / 100);
  }
}
