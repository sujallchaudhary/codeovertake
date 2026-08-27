/**
 * Runs `tasks` (array of zero-arg functions returning promises) with a bounded
 * number of parallel workers, optionally sleeping between tasks to stay inside
 * third-party rate limits.
 *
 * Mirrors the worker-pool used by cron/updateData.js but shared so import and
 * catalog-seeding paths get the same behaviour.
 *
 * @returns {Promise<Array<{status:'fulfilled'|'rejected', value?:any, reason?:any}>>}
 */
async function processQueue(tasks, concurrency = 5, delayMs = 0) {
  const results = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const current = index;
      index += 1;
      try {
        results[current] = { status: 'fulfilled', value: await tasks[current]() };
      } catch (reason) {
        results[current] = { status: 'rejected', reason };
      }
      if (delayMs > 0 && index < tasks.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, tasks.length)) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

module.exports = { processQueue };
