// Задание 2. Сервис платежей.
// Используется несколькими формами пополнения и вывода, в браузере и в WebView.
// Задача: найти проблемы (архитектура, RxJS, кэш, ошибки, безопасность, WebView/SSR)
// и предложить, как переписать.

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, retry, shareReplay } from 'rxjs/operators';

export interface Payment {
  id: number;
  status: string;
  url?: string;
}

@Injectable({ providedIn: 'root' })
export class PaymentService {
  public payments$ = new BehaviorSubject<Payment[]>([]);
  public selectedAmount = 0;
  public isLoading = false;

  private ratesCache: any = {};
  private rate$: Observable<number>;

  constructor(private http: HttpClient) {
    this.loadPayments();

    setInterval(() => {
      this.loadPayments();
    }, 5000);
  }

  get token(): string {
    return document.cookie.split('token=')[1];
  }

  get isIos(): boolean {
    return navigator.userAgent.includes('iPhone');
  }

  loadPayments(): void {
    this.isLoading = true;
    this.http
      .get<Payment[]>('/api/payments?token=' + this.token)
      .pipe(retry())
      .subscribe((payments) => {
        this.payments$.next(payments);
        this.isLoading = false;
      });
  }

  getRate(currency: string): Observable<number> {
    if (!this.rate$) {
      this.rate$ = this.http
        .get<any>('/api/rates/' + currency)
        .pipe(
          map((res) => res.rate),
          shareReplay(1),
        );
    }

    return this.rate$;
  }

  getRateForBank(bank: string, currency: string): Observable<number> {
    if (this.ratesCache[bank]) {
      return of(this.ratesCache[bank]);
    }

    return this.http.get<any>(`/api/rates?bank=${bank}&currency=${currency}`).pipe(
      map((res) => {
        this.ratesCache[bank] = res.rate;
        return res.rate;
      }),
      catchError(() => of(0)),
    );
  }

  calculate(amount: number, rate: number): number {
    return Math.round(amount * rate * 100) / 100;
  }

  createPayment(form: any): Promise<Payment> {
    this.selectedAmount = form.amount;
    console.log('create payment', form, this.token);

    return this.http
      .post<Payment>('/api/payments', { ...form, amount: form.amount * 100 })
      .toPromise()
      .then((payment) => {
        const list = this.payments$.value;
        list.push(payment);
        this.payments$.next(list);

        localStorage.setItem('lastPayment', JSON.stringify(payment));
        return payment;
      });
  }

  getLastPayment(): Payment {
    return JSON.parse(localStorage.getItem('lastPayment'));
  }

  openPaymentPage(url: string): void {
    if (this.isIos) {
      window.location.href = 'myapp://openExternalUrl?link=' + url;
    } else {
      window.open(url);
    }
  }
}
