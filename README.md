# Modulo NestJS per la gestione IP List Cloudflare

## Prima di iniziare

1. Creare un account Cloudflare
2. Scegliere il Dominio da utilizzare
3. Manage Account > Configuration > List > Create List
4. Account API tokens > Create Token > Create Custom Token (Permission: Account > Account WAF > Edit, Account > Account Filter List > Edit)
5. Salvare il token API senza scadenza
6. Domains > Scegliere il dominio da utilizzare 
7. Andare nella categoria Security > Security Rules > Create rule > Custom Rules
8. Nome: <Name>, Field: <IP Source Address , is in, scegli la lista creata prima>, Action: <Block> 
9. Salvare la regola
10. Creare un token API

## Installazione

```bash
npm install @liberstudio/cloudflare-list
```

## Utilizzo

### Configurazione

Nel file di configurazione del progetto, aggiungere il modulo all'import della configurazione:

```typescript
import { CloudflareAttacksModule } from "@liberstudio/cloudflare-list";

@Module({
  imports: [
    CloudflareAttacksModule.forRoot({
      accountId: "<account_id>",
      listId: "<list_id>",
      apiToken: "<api_token>",
      comment: "<comment>",
    }),
  ],
})
export class AppModule {}
```
