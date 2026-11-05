// Задание 1. Компонент ввода суммы пополнения.
// Компонент работает и в браузере, и внутри WebView мобильного приложения.
// Задача: найти проблемы (логика, производительность, утечки, UX, безопасность, WebView/SSR)
// и предложить, как переписать.

import { Component, Input, OnInit, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PaymentService } from './payment.service';

@Component({
  selector: 'app-deposit-amount',
  template: `
    <form [formGroup]="form" (ngSubmit)="submit()">
      <label>Сумма</label>
      <input formControlName="amount" type="text" />

      <div *ngIf="form.controls.amount.errors?.min">Минимум {{ minAmount }}$</div>

      <select formControlName="bank">
        <option *ngFor="let bank of getBanks()" [value]="bank.id">{{ bank.name }}</option>
      </select>

      <div class="converter" style="margin-left: 16px">
        Вы получите: {{ getConverted() }}
        <span>Курс: {{ rate?.toFixed(2) }}</span>
      </div>

      <div [innerHTML]="serverMessage"></div>

      <label>
        <input type="checkbox" formControlName="agree" />
        Я согласен с курсом
      </label>

      <button type="submit" [disabled]="isLoading">Пополнить</button>
    </form>
  `,
})
export class DepositAmountComponent implements OnInit {
  @Input() set currency(value: string) {
    this._currency = value;
    this.form.controls.amount.setValue(Math.round(this.form.value.amount));
  }
  @Input() minAmount: number;
  @Input() banks: any[] = [];

  @Output() paid = new EventEmitter<any>();

  _currency = 'USD';
  rate: number;
  serverMessage = '';
  isLoading = false;

  form = new FormGroup({
    amount: new FormControl<any>(null, [Validators.required, Validators.min(this.minAmount)]),
    bank: new FormControl(null),
    agree: new FormControl(false),
  });

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private paymentService: PaymentService,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    const saved = localStorage.getItem('lastAmount');
    const fromUrl = this.route.snapshot.queryParams['amount'];
    this.form.patchValue({ amount: parseFloat(fromUrl || saved) });

    this.form.valueChanges.subscribe((value) => {
      localStorage.setItem('lastAmount', value.amount);
      this.isLoading = true;

      this.http
        .post<any>('/api/payments/calculate', {
          amount: value.amount * 100,
          bank: value.bank,
          currency: this._currency,
        })
        .subscribe(
          (res) => {
            this.rate = res.exchangeRate;
            this.form.patchValue({ agree: false });
            this.isLoading = false;
          },
          (err) => {
            this.serverMessage = err.error.message;
          },
        );
    });

    setInterval(() => {
      this.cdr.detectChanges();
    }, 1000);
  }

  getBanks() {
    return this.banks.filter((bank) => bank.enabled).sort((a, b) => a.order - b.order);
  }

  getConverted(): string {
    return '$' + (this.form.value.amount * this.rate).toFixed(2);
  }

  submit(): void {
    if (!this.form.value.agree) {
      alert('Подтвердите курс');
      return;
    }

    this.isLoading = true;
    this.paymentService.createPayment(this.form.value).then((payment: any) => {
      this.isLoading = false;
      this.paid.emit(payment);

      if (payment.url) {
        window.open(payment.url, '_blank');
      }
    });
  }
}
