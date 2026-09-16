# Azure Container Apps: sleeping between games

These commands configure existing Game and Words Container Apps after deploying the updated images. They do not provision resources or deploy the application. No Azure resources have been changed from this workspace.

Use the Consumption workload profile for both APIs in the same environment. Game needs HTTP ingress reachable by the frontend; Words needs internal HTTP ingress reachable by Game. Keep the same non-example `Services__ApiKey` secret on both services and separate database connection strings. Both Dockerfiles listen on port 8080.

## Configure existing apps

Use Azure CLI in PowerShell. Replace these values with existing resource names. The commands change configuration and create revisions. Check each command succeeds before continuing.

```powershell
$azureSubscription = 'YOUR_SUBSCRIPTION_ID'
$azureResourceGroup = 'YOUR_RESOURCE_GROUP'
$azureGameApp = 'YOUR_GAME_APP'
$azureWordsApp = 'YOUR_WORDS_APP'

az containerapp revision set-mode --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureGameApp --mode single --output none
az containerapp revision set-mode --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureWordsApp --mode single --output none

az containerapp ingress enable --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureGameApp --type external --target-port 8080 --transport auto --output none
az containerapp ingress enable --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureWordsApp --type internal --target-port 8080 --transport auto --output none

az containerapp update --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureGameApp --min-replicas 0 --max-replicas 1 --scale-rule-name http --scale-rule-type http --scale-rule-http-concurrency 10 --output none
az containerapp update --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureWordsApp --min-replicas 0 --max-replicas 1 --scale-rule-name http --scale-rule-type http --scale-rule-http-concurrency 10 --output none

$azureWordsFqdn = az containerapp show --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureWordsApp --query properties.configuration.ingress.fqdn --output tsv
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($azureWordsFqdn)) { throw 'Could not read the Words API ingress address.' }
az containerapp update --subscription $azureSubscription --resource-group $azureResourceGroup --name $azureGameApp --set-env-vars "Services__WordsUrl=https://$azureWordsFqdn" --output none
```

Select the environment's `Consumption` profile in the portal or existing deployment template. Dedicated profile nodes can continue billing with zero app replicas. Remove existing CPU, memory, timer, or other scale rules so only the HTTP rule remains. Single revision mode prevents older active revisions retaining their own replica minimums.

HTTP ingress receives the request that starts a replica from zero. Keep Words ingress enabled; disabling it removes the HTTP route that wakes the service. Use its normal app FQDN rather than a replica address. Requests between apps in the same environment stay inside that environment. [Azure scaling](https://learn.microsoft.com/en-us/azure/container-apps/scale-app), [service communication](https://learn.microsoft.com/en-us/azure/container-apps/connect-apps), [CLI update reference](https://learn.microsoft.com/en-us/cli/azure/containerapp#az-containerapp-update)

## Health probes without idle SQL

Use `/health/live` for recurring liveness and readiness probes. It performs no SQL. The `/health/ready` endpoint checks PostgreSQL and, for Words, that a catalog exists. Use it for a one-time deployment check or startup probe. Initialization runs once each time a process starts; subsequent database outages are reported by affected API requests.

Merge this fragment under each existing API container's `probes` property in its deployment template. Preserve the image, environment variables, resources, and secrets. Startup can wait approximately four minutes for database and catalog readiness; recurring probes use the cheap endpoint.

```yaml
probes:
  - type: Startup
    httpGet:
      path: /health/ready
      port: 8080
    initialDelaySeconds: 1
    periodSeconds: 5
    timeoutSeconds: 5
    failureThreshold: 48
  - type: Liveness
    httpGet:
      path: /health/live
      port: 8080
    periodSeconds: 30
    timeoutSeconds: 5
    failureThreshold: 3
  - type: Readiness
    httpGet:
      path: /health/live
      port: 8080
    periodSeconds: 30
    timeoutSeconds: 5
    failureThreshold: 3
```

An empty Words catalog fails the startup probe above. Add valid pairs before routing games to that revision. Alternatively use `/health/live` for Startup and check `/health/ready` once inside the environment during deployment; games return an error until words exist. TCP probes also avoid SQL. Built-in replica probes differ from external monitors repeatedly requesting public ingress. Avoid external keepalive or health pings when you want the app to sleep. [Azure health probes](https://learn.microsoft.com/en-us/azure/container-apps/health-probes)

## Runtime behavior

- Azure scales HTTP APIs using incoming traffic, not room count. Home pages make no lobby polls. Persisted disconnected rooms can remain stored with zero API replicas.
- Browser polling pauses immediately when hidden or offline. In a lobby or on results, it also pauses after five minutes without pointer or keyboard activity. Returning, reconnecting, or choosing Resume refreshes the room before enabling game controls.
- Visible active rounds, voting, and guessing continue polling. Close those tabs when everybody is finished; a visible abandoned active game can keep Game awake.
- Persisted UTC deadlines continue while everybody disconnects. The first returning authorized request catches up elapsed turns and may return the voting screen.
- Browser requests allow 120 seconds and Game allows 90 seconds for Words to wake. The included Nginx proxy allows 120 seconds between response reads; align other frontend proxies with the client timeout. Refresh the lobby before retrying a timed-out action, because it may already have completed.
- Memory caches disappear on shutdown. PostgreSQL retains rooms, roles, votes, words, and hints. Cache expiration refreshes on the next request, without background jobs.
- Azure Database for PostgreSQL does not stop with the APIs. Its compute and storage billing remain separate. An external database with its own idle suspension can sleep once all clients stop sending SQL.

Scale down follows the platform's idle interval, rather than happening immediately when the last player leaves. Zero replicas incur no replica compute usage. [Container Apps billing](https://learn.microsoft.com/en-us/azure/container-apps/billing)

## Verify after deployment

1. Play a complete three-session game. Confirm timed turns advance without confirmation.
2. Close game tabs and stop external monitors. Wait for scale down and check replica counts in portal metrics. Calling an API to test whether it is asleep wakes it.
3. Reopen the same saved session. Confirm room and role persistence, elapsed deadlines, and private word isolation.
4. Start another game after Words reaches zero replicas. Confirm the internal request wakes it.
5. Check idle database activity. Recurring SQL must not come from API timers, health monitors, or pool keepalive settings.

Settings were checked against Microsoft's documentation. Cloud scale-down verification requires a deployed Azure environment and has not been performed here.

## React on Azure Static Web Apps Free

The frontend supports VITE_API_BASE_URL at build time, with /api as the local default.

1. Create a Static Web App linked to this GitHub repository and main branch. Use app location src/imposter-web, no API location, and output location dist.
2. In GitHub repository Settings > Secrets and variables > Actions > Variables, add VITE_API_BASE_URL with https://YOUR-GAME-APP.azurecontainerapps.io/api. This is a public URL, not a secret.
3. In the generated Static Web Apps workflow, add the following env mapping to the Azure/static-web-apps-deploy step that builds and uploads the app:

```yaml
env:
  VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
```

The env mapping belongs beside uses and with, not inside with. Keep the generated deployment token reference. If the workflow builds separately with npm run build and uses skip_app_build, put this env mapping on the build step instead. Use Node.js 22 for a separate build. Updating only the Static Web App runtime settings does not rebuild the JavaScript bundle.

4. On the Game Container App, set Frontend__Origin to the exact Static Web App origin, for example https://YOUR-SITE.azurestaticapps.net (no path). Redeploy the Game image containing this CORS configuration and create a revision with that variable. It allows browser requests only from the configured origin. Leaving it unset preserves same-origin local access and grants no cross-origin access.
5. Rebuild and deploy the frontend after changing VITE_API_BASE_URL. Verify creating a lobby, joining from a second browser, and starting a game. Browser network requests should target the Game host at /api/lobbies. The Words URL and service API key belong only in the Game backend configuration.

Do not put database passwords or Services__ApiKey in any VITE_ variable; these variables are embedded in the public JavaScript bundle.
