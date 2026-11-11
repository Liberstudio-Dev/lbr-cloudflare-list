# @liberstudio/cloudflare-list

Modulo NestJS per il rilevamento e blocco automatico di attacchi tramite Cloudflare IP List.

Ogni richiesta che produce un `404` su un indirizzo senza nessuna rotta viene considerata sospetta (tipicamente bot, scanner, enumeratori: `/wp-admin`, `/.env`). Il `404` restituito da una rotta esistente (es. `GET /artworks/:id` di una risorsa che non c'è) non viene bloccato. L'IP viene risolto tramite ASN lookup per ottenere l'intero range di subnet e bloccarlo direttamente sulla lista Cloudflare WAF. Se il lookup fallisce, viene bloccato il singolo IP.

## Come funziona

```
Request → 404 rilevato dal middleware (solo se nessuna rotta ha risposto)
  └─ IP estratto (cf-connecting-ip / x-real-ip / x-forwarded-for)
       └─ throttle 5s per IP
            └─ log su file (se path non è silentPath)
                 └─ allowedIps? → skip (log only)
                      └─ IP Cloudflare? → skip (log only)
                           └─ ASN lookup su api.hackertarget.com
                                ├─ range trovato → blocca intera subnet su Cloudflare
                                └─ fallback      → blocca singolo IP /32 o /128
```

### Filtraggio automatico

Il modulo ignora automaticamente:
- IP nella whitelist `allowedIps` (configurazione statica)
- IP appartenenti ai range ufficiali Cloudflare (scaricati e cachati 24h)
- IP privati (10.x, 192.168.x, 172.16–31.x)
- Loopback (127.0.0.1, ::1)
- IPv4-mapped IPv6 (::ffff:x.x.x.x → convertiti in IPv4)

### Gestione errori e log

- `AllExceptionsFilter` globale cattura tutte le eccezioni non gestite e le logga a console con IP, metodo, path e status code
- Con `verbose: true` il log include anche body, query, params e stack trace

---

## Prima di iniziare su Cloudflare

1. Creare un account Cloudflare
2. Scegliere il dominio da utilizzare
3. **Manage Account > Configuration > Lists > Create List** (tipo: IP)
4. **Account API tokens > Create Token > Create Custom Token**
   - Permission: `Account > Account WAF > Edit`
   - Permission: `Account > Account Filter Lists > Edit`
5. **Security > WAF > Custom Rules > Create Rule**
   - Field: `IP Source Address` — `is in` — scegli la lista creata
   - Action: `Block`
6. Salvare la regola

Con più account Cloudflare ripetere i passi per ogni account: ognuno ha la sua lista, il suo token e la sua regola WAF.

---

## Installazione

```bash
npm install @liberstudio/cloudflare-list
```

---

## Configurazione

### Statica (`forRoot`)

```typescript
import { CloudflareAttacksModule } from "@liberstudio/cloudflare-list";

@Module({
  imports: [
    CloudflareAttacksModule.forRoot({
      accounts: [
        { accountId: "abc123", listId: "def456", apiToken: "token-account-1" },
        { accountId: "ghi789", listId: "jkl012", apiToken: "token-account-2" },
      ],
      comment:   "Blocked by liberstudio/cloudflare-list",
      logPath:   "/var/log/nestjs-attacks.log",
      allowedIps:    ["1.2.3.4", "10.0.0.0/8"],
      excludedPaths: ["/api/health", "/api/webhook"],
      silentPaths:   ["/auth/me", "/auth/refresh"],
      verbose: false,
      telegramNotify: { chatId: "123456789" },
    }),
  ],
})
export class AppModule {}
```

### Asincrona (`forRootAsync`) con `ConfigModule`

```typescript
import { CloudflareAttacksModule } from "@liberstudio/cloudflare-list";

@Module({
  imports: [
    CloudflareAttacksModule.forRootAsync({
      imports: [ConfigModule],
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => ({
        accounts: [
          {
            apiToken:  config.getOrThrow<string>("CLOUDFLARE_API_TOKEN"),
            accountId: config.getOrThrow<string>("CLOUDFLARE_ACCOUNT_ID"),
            listId:    config.getOrThrow<string>("CLOUDFLARE_LIST_ID"),
          },
          {
            apiToken:  config.getOrThrow<string>("CLOUDFLARE_2_API_TOKEN"),
            accountId: config.getOrThrow<string>("CLOUDFLARE_2_ACCOUNT_ID"),
            listId:    config.getOrThrow<string>("CLOUDFLARE_2_LIST_ID"),
          },
        ],
        comment:   config.get<string>("CLOUDFLARE_LIST_COMMENT") || "Blocked",
        logPath:   config.get<string>("CLOUDFLARE_LIST_LOG_PATH") || "/var/log/nestjs-attacks.log",
        allowedIps:    ["1.2.3.4", "10.0.0.0/8"],
        excludedPaths: ["/api/health", "/api/webhook", /^\/api\/public\/.*/],
        silentPaths:   ["/auth/me", "/auth/refresh"],
        verbose: false,
        telegramNotify: {
          chatId: config.getOrThrow<string>("TELEGRAM_NOTIFY_CHAT_ID"),
        },
        notifyProvider: config.get<"whatsapp" | "telegram">("NOTIFY_PROVIDER"), // assente → scelta automatica
      }),
    }),
  ],
})
export class AppModule {}
```

---

## Opzioni di configurazione

| Opzione | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `accounts` | `CloudflareAccount[]` | si | Account Cloudflare su cui bannare (almeno uno), vedi sotto |
| `comment` | `string` | si | Commento aggiunto ad ogni IP bloccato |
| `logPath` | `string` | si | Percorso del file di log degli attacchi |
| `allowedIps` | `string[]` | no | IP o CIDR mai bloccati (whitelist, supporta IPv4 e IPv6) |
| `excludedPaths` | `(string \| RegExp)[]` | no | Path esclusi da ogni rilevamento e log |
| `silentPaths` | `(string \| RegExp)[]` | no | Path bloccati su Cloudflare ma senza log su file |
| `verbose` | `boolean` | no | Se `true`, il log include body, query, params e stack |
| `whatsappNotify` | `{ phone: string }` | no | Invia una notifica WhatsApp quando un IP viene bannato |
| `telegramNotify` | `{ chatId: string }` | no | Invia una notifica Telegram quando un IP viene bannato |
| `notifyProvider` | `"whatsapp" \| "telegram"` | no | Canale di notifica da usare (default: vedi sotto) |

### `accounts` — ban su più account Cloudflare

Ogni elemento di `accounts` è un `CloudflareAccount`:

| Campo | Tipo | Obbligatorio | Descrizione |
|---|---|---|---|
| `apiToken` | `string` | si | Token API Cloudflare con accesso all'account |
| `accountId` | `string` | si | ID account Cloudflare |
| `listId` | `string` | si | ID della IP List dell'account |

Ad ogni ban l'IP (o la subnet) viene aggiunto **in parallelo** alle liste di tutti gli account:

- se un account fallisce, l'errore viene loggato con il suo `accountId` e gli altri proseguono;
- se falliscono **tutti**, `updateIpList()` lancia `HttpException` con il primo errore;
- `updateIpList()` e `blockIp()` ritornano un `CloudflareResponse[]` con le risposte degli account riusciti.

Se lo stesso token ha accesso a più account, basta ripeterlo in ogni elemento.

### Migrazione dalla 2.x

La 3.0.0 è un breaking change: `apiToken`, `accountId` e `listId` non stanno più alla radice delle opzioni, ma dentro `accounts`.

```typescript
// 2.x
{ apiToken: "...", accountId: "...", listId: "...", comment: "...", logPath: "..." }

// 3.x
{ accounts: [{ apiToken: "...", accountId: "...", listId: "..." }], comment: "...", logPath: "..." }
```

Inoltre `updateIpList()` ritorna `CloudflareResponse[]` invece di `CloudflareResponse`, e `blockIp()` ritorna `CloudflareResponse[] | null`.

### `notifyProvider` — scelta del canale di notifica

Ad ogni ban viene inviata **una sola** notifica, sul canale scelto:

- se `notifyProvider` è impostato, si usa quel canale;
- altrimenti si usa **WhatsApp** solo se è configurato del tutto (`whatsappNotify` + le 4 variabili `WA_*`), in ogni altro caso **Telegram**.

Se il canale scelto non è configurato (es. `telegramNotify` assente) la notifica viene saltata.

### `telegramNotify` — notifiche ban su Telegram

Invia il messaggio di ban tramite un bot Telegram. Il token del bot è letto da `process.env.TELEGRAM_BOT_TOKEN`.

```typescript
telegramNotify: {
  chatId: "123456789", // id della chat, del gruppo (es. "-100...") o "@nomecanale"
}
```

Per ricavare il `chatId`: scrivi un messaggio al bot (o aggiungilo al gruppo), poi apri `https://api.telegram.org/bot<TOKEN>/getUpdates` e leggi `message.chat.id`.

```env
TELEGRAM_BOT_TOKEN=123456:ABC-your-bot-token
TELEGRAM_NOTIFY_CHAT_ID=123456789
NOTIFY_PROVIDER=telegram   # opzionale: whatsapp | telegram
```

### `whatsappNotify` — notifiche ban su WhatsApp

Quando configurato, invia un messaggio WhatsApp ad un numero specifico ogni volta che un IP viene bloccato su Cloudflare. Richiede le variabili d'ambiente `WA_URL`, `WA_USER`, `WA_PASSWORD` e `CLOUDFLARE_WA_DEVICE_ID` già presenti nel progetto (lette automaticamente da `process.env`).

```typescript
whatsappNotify: {
  phone: "393331234567", // numero con prefisso internazionale, senza +
}
```

Il messaggio inviato sarà:
```
🚨 IP bannato su Cloudflare
Provenienza: Blocked by liberstudio/cloudflare-list
IP: 1.2.3.4
Subnet bloccata: 1.2.0.0/16
Account: 2/2
```

`Account` indica su quanti account configurati il ban è andato a buon fine. La notifica è sempre **una** per ban.

Variabili d'ambiente richieste (lette automaticamente da `process.env`):
```env
WA_URL=https://messaggistica.liberdesign.eu
WA_USER=your-user
WA_PASSWORD=your-password
CLOUDFLARE_WA_DEVICE_ID=your-device-id
WA_NOTIFY_PHONE=393331234567
```

### `allowedIps` — whitelist server

Lista di IP o subnet CIDR che non vengono mai bloccati, indipendentemente dal comportamento. Utile per i propri server, proxy interni, CDN proprietarie. Supporta IPv4, CIDR IPv4, IPv6 e CIDR IPv6:

```typescript
allowedIps: [
  "1.2.3.4",           // IP singolo IPv4
  "10.0.0.0/8",        // subnet IPv4
  "2001:db8::1",       // IP singolo IPv6
  "2001:db8::/32",     // subnet IPv6
]
```

> I range ufficiali Cloudflare sono esclusi automaticamente senza bisogno di aggiungerli qui.

### `excludedPaths` vs `silentPaths`

- **`excludedPaths`**: il path viene ignorato completamente — nessun log, nessun blocco. Usato per path infrastrutturali (`/health`, `/webhook`).
- **`silentPaths`**: il path viene bloccato su Cloudflare ma non viene scritto sul file di log. Usato per path che generano 404 legittimi frequenti (`/auth/me`, `/auth/refresh`).

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
