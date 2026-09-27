// Manually purge accounts whose deletion grace period ended. The server does
// this hourly on its own (lib/account-purge-scheduler.ts); this is for support
// or right after a deploy. Run: `doppler run -- npm run accounts:purge`.

import { client } from "@/db";
import { purgeDueAccounts } from "@/lib/account";

purgeDueAccounts()
  .then(purged => console.log(`purged ${purged} account(s)`))
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => client.end());
