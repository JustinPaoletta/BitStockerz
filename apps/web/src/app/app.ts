import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TokenStorageService } from './core/auth/token-storage.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly tokens = inject(TokenStorageService);
  private readonly router = inject(Router);

  protected logout(): void {
    this.tokens.clear();
    void this.router.navigate(['/login']);
  }
}
