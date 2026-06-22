---
change_id: recipients-resend-notice
title: Baner o ograniczeniu darmowego Resend na stronie odbiorców
status: implemented
created: 2026-06-22
updated: 2026-06-22
archived_at: null
---

## Notes

baner ostrzegawczy na /dashboard/recipients o ograniczeniu darmowego Resend (wysyłka tylko na 1 zdefiniowany adres do czasu weryfikacji domeny)

Szybka ścieżka 10x (bez plan-review/impl-review). Komunikat: „Ze względu na ograniczenia darmowej wersji resend.com, nie ma teraz możliwości wysyłki mailingów na więcej niż 1 zdefiniowany adres." Wykorzystać istniejący [[]] komponent Banner.astro (variant="warning"). Powiązane: [[project-resend-mailing-setup]].
