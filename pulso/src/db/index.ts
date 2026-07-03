import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

import * as schema from './schema';

const client = openDatabaseSync('pulso.db', { enableChangeListener: true });

export const db = drizzle(client, { schema });
export type DB = typeof db;
