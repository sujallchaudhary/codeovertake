/**
 * Seeds the curated content that ships with the app: Explore Sheets and
 * Company Interview Kits.
 *
 * Usage:
 *   node scripts/seedContent.js              # sheets + company kits
 *   node scripts/seedContent.js --sheets     # sheets only
 *   node scripts/seedContent.js --companies  # company kits only
 *   node scripts/seedContent.js --catalog    # also bulk-seed the problem catalog
 *
 * Idempotent: sheets are matched by slug and rebuilt in place, and company tags
 * are merged rather than duplicated. Safe to re-run after editing the data files.
 *
 * Problem metadata (title, difficulty, topics) is fetched from each platform the
 * first time a problem is seen, so the first run takes a couple of minutes.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Sheet = require('../models/Sheet');
const Problem = require('../models/Problem');
const problemService = require('../services/problemService');
const { processQueue } = require('../utils/concurrency');
const { expandRef } = require('./data/problemRefs');
const curatedSheets = require('./data/curatedSheets');
const companyKits = require('./data/companyKits');

/** Resolves refs to catalog rows, reporting progress as it goes. */
async function resolveRefs(refs, label) {
  const unique = [...new Set(refs.map(expandRef))];
  console.log(`[SEED] Resolving ${unique.length} unique problems for ${label}...`);

  let done = 0;
  const results = await processQueue(
    unique.map((url) => async () => {
      const problem = await problemService.resolveByUrl(url);
      done += 1;
      if (done % 25 === 0) console.log(`[SEED]   ${done}/${unique.length}`);
      return { url, problem };
    }),
    4,
    120,
  );

  const byUrl = new Map();
  const failures = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value?.problem) {
      byUrl.set(unique[i], r.value.problem);
    } else {
      failures.push({ url: unique[i], message: r.reason?.message || 'unknown error' });
    }
  });

  if (failures.length) {
    console.warn(`[SEED] ${failures.length} problems could not be resolved:`);
    failures.slice(0, 10).forEach((f) => console.warn(`[SEED]   ${f.url} -> ${f.message}`));
  }
  return byUrl;
}

async function seedSheets() {
  console.log(`\n[SEED] === Curated sheets (${curatedSheets.length}) ===`);

  const allRefs = curatedSheets.flatMap(
    (sheet) => sheet.sections.flatMap((section) => section.problems),
  );
  const byUrl = await resolveRefs(allRefs, 'curated sheets');

  for (const definition of curatedSheets) {
    const sections = [];
    let questionCount = 0;

    definition.sections.forEach((section, sectionIndex) => {
      const questions = [];
      section.problems.forEach((ref) => {
        const problem = byUrl.get(expandRef(ref));
        if (!problem) return;
        questions.push({ problem: problem._id, order: questions.length });
      });
      questionCount += questions.length;
      sections.push({
        title: section.title,
        order: sectionIndex,
        questions,
        subsections: [],
      });
    });

    // Rebuild in place so re-running picks up edits to the data file
    await Sheet.findOneAndUpdate(
      { slug: definition.slug },
      {
        $set: {
          title: definition.title,
          slug: definition.slug,
          description: definition.description,
          owner: null,
          isCurated: true,
          curator: definition.curator || '',
          category: definition.category,
          visibility: 'public',
          tags: definition.tags || [],
          icon: definition.icon || '',
          questions: [],
          sections,
          questionCount,
        },
      },
      { upsert: true, new: true },
    );

    console.log(`[SEED] ${definition.title.padEnd(28)} ${String(questionCount).padStart(3)} questions, ${sections.length} topics`);
  }
}

async function seedCompanyKits() {
  console.log(`\n[SEED] === Company interview kits (${companyKits.length}) ===`);

  const allRefs = companyKits.flatMap(
    (company) => Object.values(company.buckets).flat(),
  );
  const byUrl = await resolveRefs(allRefs, 'company kits');

  for (const company of companyKits) {
    // problemId -> Set(buckets), so one problem carries every window it appears in
    const bucketsByProblem = new Map();

    for (const [bucket, refs] of Object.entries(company.buckets)) {
      for (const ref of refs) {
        const problem = byUrl.get(expandRef(ref));
        if (!problem) continue;
        const key = String(problem._id);
        if (!bucketsByProblem.has(key)) bucketsByProblem.set(key, new Set());
        bucketsByProblem.get(key).add(bucket);
        // Anything asked recently is also an all-time entry
        bucketsByProblem.get(key).add('all-time');
      }
    }

    const slug = problemService.slugifyCompany(company.name);
    let tagged = 0;

    for (const [problemId, buckets] of bucketsByProblem.entries()) {
      // eslint-disable-next-line no-await-in-loop
      const problem = await Problem.findById(problemId);
      if (!problem) continue;

      const existing = problem.companies.find((c) => c.slug === slug);
      if (existing) {
        existing.name = company.name;
        existing.buckets = [...new Set([...(existing.buckets || []), ...buckets])];
        // Frequency approximates "how many windows mention it"
        existing.frequency = Math.max(existing.frequency || 1, buckets.size);
      } else {
        problem.companies.push({
          name: company.name,
          slug,
          frequency: buckets.size,
          buckets: [...buckets],
          lastAskedAt: buckets.has('45-days') ? new Date() : null,
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await problem.save();
      tagged += 1;
    }

    console.log(`[SEED] ${company.name.padEnd(28)} ${String(tagged).padStart(3)} problems tagged`);
  }
}

async function seedCatalog() {
  console.log('\n[SEED] === Bulk problem catalog ===');
  console.log('[SEED] Seeding the full Codeforces problemset...');
  const cf = await problemService.seedCodeforcesCatalog();
  console.log(`[SEED] Codeforces: ${cf.upserted} problems`);

  console.log('[SEED] Seeding LeetCode problems (this takes a few minutes)...');
  const lc = await problemService.seedLeetcodeCatalog();
  console.log(`[SEED] LeetCode: ${lc.upserted} problems`);
}

(async () => {
  const args = process.argv.slice(2);
  const only = {
    sheets: args.includes('--sheets'),
    companies: args.includes('--companies'),
    catalog: args.includes('--catalog'),
  };
  const runAll = !only.sheets && !only.companies && !only.catalog;

  const started = Date.now();
  await connectDB();

  try {
    if (only.catalog) await seedCatalog();
    if (runAll || only.sheets) await seedSheets();
    if (runAll || only.companies) await seedCompanyKits();

    const totals = await Promise.all([
      Sheet.countDocuments({ isCurated: true }),
      Problem.countDocuments(),
      Problem.countDocuments({ 'companies.0': { $exists: true } }),
    ]);
    console.log(`\n[SEED] Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`[SEED] Curated sheets: ${totals[0]}`);
    console.log(`[SEED] Problems in catalog: ${totals[1]}`);
    console.log(`[SEED] Problems with company tags: ${totals[2]}`);
  } catch (error) {
    console.error('[SEED] Failed:', error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
