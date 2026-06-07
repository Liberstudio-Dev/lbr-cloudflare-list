# @liberstudio/cloudflare-list

Modulo NestJS per il rilevamento e blocco automatico di attacchi tramite Cloudflare IP List.

Ogni richiesta che produce un `404` viene considerata sospetta (tipicamente bot, scanner, enumeratori). L'IP viene risolto tramite ASN lookup per ottenere l'intero range di subnet e bloccarlo direttamente sulla lista Cloudflare WAF. Se il lookup fallisce, viene bloccato il singolo IP.

## Come funziona

```
Request → 404 rilevato dal middleware
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
      accountId: "abc123",
      listId:    "def456",
      apiToken:  "your-cloudflare-api-token",
      comment:   "Blocked by liberstudio/cloudflare-list",
      logPath:   "/var/log/nestjs-attacks.log",
      allowedIps:    ["1.2.3.4", "10.0.0.0/8"],
      excludedPaths: ["/api/health", "/api/webhook"],
      silentPaths:   ["/auth/me", "/auth/refresh"],
      verbose: false,
      whatsappNotify: { phone: "393331234567" },
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
        apiToken:  config.getOrThrow<string>("CLOUDFLARE_API_TOKEN"),
        accountId: config.getOrThrow<string>("CLOUDFLARE_ACCOUNT_ID"),
        listId:    config.getOrThrow<string>("CLOUDFLARE_LIST_ID"),
        comment:   config.get<string>("CLOUDFLARE_LIST_COMMENT") || "Blocked",
        logPath:   config.get<string>("CLOUDFLARE_LIST_LOG_PATH") || "/var/log/nestjs-attacks.log",
        allowedIps:    ["1.2.3.4", "10.0.0.0/8"],
        excludedPaths: ["/api/health", "/api/webhook", /^\/api\/public\/.*/],
        silentPaths:   ["/auth/me", "/auth/refresh"],
        verbose: false,
        whatsappNotify: {
          phone: config.getOrThrow<string>("WA_NOTIFY_PHONE"),
        },
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
| `apiToken` | `string` | si | Token API Cloudflare |
| `accountId` | `string` | si | ID account Cloudflare |
| `listId` | `string` | si | ID della IP List Cloudflare |
| `comment` | `string` | si | Commento aggiunto ad ogni IP bloccato |
| `logPath` | `string` | si | Percorso del file di log degli attacchi |
| `allowedIps` | `string[]` | no | IP o CIDR mai bloccati (whitelist, supporta IPv4 e IPv6) |
| `excludedPaths` | `(string \| RegExp)[]` | no | Path esclusi da ogni rilevamento e log |
| `silentPaths` | `(string \| RegExp)[]` | no | Path bloccati su Cloudflare ma senza log su file |
| `verbose` | `boolean` | no | Se `true`, il log include body, query, params e stack |
| `whatsappNotify` | `{ phone: string }` | no | Invia una notifica WhatsApp quando un IP viene bannato |

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
```

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
