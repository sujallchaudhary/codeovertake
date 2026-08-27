#!/usr/bin/env node
require('dotenv').config();
const { withDatabase, previewDatabaseName, redactUri } = require('../utils/mongoUri');

/**
 * Preview-database management, called from the CI/CD workflows.
 *
 *   node scripts/previewDb.js uri  <pr-number>   # print the isolated URI
 *   node scripts/previewDb.js name <pr-number>   # print just the database name
 *   node scripts/previewDb.js drop <pr-number>   # delete it (teardown)
 *
 * Reads MONGODB_URI as the base cluster connection string. `uri` writes only the
 * URI to stdout so a workflow can capture it directly; everything else goes to
 * stderr to keep that clean.
 */
const [command, prNumber] = process.argv.slice(2);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: previewDb.js <uri|name|drop> <pr-number>');
  process.exit(1);
}

if (!command) usage('a command is required');
if (!prNumber) usage('a PR number is required');

const baseUri = process.env.MONGODB_URI;
if (!baseUri) usage('MONGODB_URI is not set');

let dbName;
let uri;
try {
  dbName = previewDatabaseName(prNumber, process.env.PREVIEW_DB_PREFIX || 'codeovertake_pr');
  uri = withDatabase(baseUri, dbName);
} catch (error) {
  usage(error.message);
}

(async () => {
  switch (command) {
    case 'name':
      process.stdout.write(`${dbName}\n`);
      break;

    case 'uri':
      // stdout is the machine-readable channel here
      process.stdout.write(`${uri}\n`);
      break;

    case 'drop': {
      const mongoose = require('mongoose');
      console.error(`Dropping preview database ${dbName} on ${redactUri(uri)}`);
      try {
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
        await mongoose.connection.dropDatabase();
        console.error(`Dropped ${dbName}`);
      } catch (error) {
        // Teardown must not fail the workflow: a preview that was never deployed
        // has no database, and leaving one behind is cheap compared to a red run.
        console.error(`Could not drop ${dbName}: ${error.message}`);
        process.exitCode = 0;
      } finally {
        await mongoose.disconnect().catch(() => {});
      }
      break;
    }

    default:
      usage(`unknown command "${command}"`);
  }
})();
