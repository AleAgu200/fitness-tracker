import { migrate } from 'drizzle-orm/expo-sqlite/migrator';

import { db } from './index';
import migrations from '../../drizzle/migrations';
import { seedDefaults } from './seed';

export async function runMigrations() {
  await migrate(db, migrations);
  await seedDefaults();
}
