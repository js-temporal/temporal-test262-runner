import color from 'ansi-colors';
import fs from 'node:fs';
import globSync from 'tiny-glob/sync.js';
import path from 'node:path';
import process from 'node:process';
import ProgressBar from 'progress';
import util from 'node:util';
import vm from 'node:vm';
import yaml from 'js-yaml';


const UTF8 = { encoding: 'utf-8' };

/**
 * Temporal Test262 runner
 *
 * Provides a fast way for polyfills of ECMAScript
 * [`Temporal`](https://github.com/tc39/proposal-temporal) to run Temporal's
 * 6,300+ Test262 tests. Test262 (https://github.com/tc39/test262) is the
 * official conformance test suite for ECMAScript, and this package quickly runs
 * a subset of those tests that are specific to Temporal. All Temporal polyfills
 * should pass Test262.
 *
 * This runner is much faster than
 * [`test262-harness`](https://github.com/bterlson/test262-harness) (the default
 * Test262 harness) because:
 * - It runs only 6,300+ Temporal-specific tests, instead of the full suite.
 * - It pre-parses the Temporal polyfill into a
 *   [`vm.Script`](https://nodejs.org/api/vm.html#class-vmscript), instead of
 *   reading and parsing the whole file once for each test like the prelude
 *   option of `test262-harness` does.
 *
 * For code coverage, set the environment variable `NODE_V8_COVERAGE` to the
 * path (relative to the working directory) where coverage metrics should be
 * output. These can be processed with the [`c8`](https://github.com/bcoe/c8)
 * tool. NOTE: as of Node 18.7 there is a memory leak that makes it impossible
 * to run the entire suite with NODE_V8_COVERAGE, so for code coverage tests you
 * should run it in chunks.
 *
 * @typedef {Object} Options
 * @property {string} polyfillCodeFile Filename of the Temporal polyfill. Must
 *   be a single ECMAScript file that contains the Temporal object injected into
 *   the global namespace, as well as Temporal-related changes polyfilled into
 *   `Intl` and `Date` built-in objects.
 * @property {string} test262Dir Root directory of the test262 submodule repo.
 * @property {string[]=} testGlobs If omitted, all Temporal tests will be run.
 *   This option provides glob patterns that specify a subset of tests to be
 *   run. Globs are resolved relative to `test/**∕Temporal/` subdirectories of
 *   `test262Dir`. If a pattern doesn't match any files relative to
 *   `test/**∕Temporal/`, it will also try to match relative to the current
 *   working directory, so that tab completion works. Example:
 *   `['PlainDateTime/**', 'prototype/with/*.js' ]`
 * @property {string[]=} expectedFailureFiles Optional array of text filenames
 *   that each contain a list of test files (relative to the `test` subdirectory
 *   of `test262Dir`) that are expected to fail. Lines starting with `#` and
 *   blank lines are ignored. Lines from multiple files will be concatenated and
 *   de-duped. Example:
 *   ```
 *   # https://github.com/tc39/test262/pull/3548
 *   built-ins/Temporal/Duration/compare/argument-string-negative-fractional-units.js
 *   built-ins/Temporal/Duration/from/argument-string-negative-fractional-units.js
 *   ```
 * @property {number|string=2000} timeoutMsecs Optional number of milliseconds
 *   to allow tests to run before they'll be terminated. This ensures that
 *   infinite-loop (or super-long) tests won't prevent others from completing.
 *   Default is 2000 msecs (2 seconds) which should be fine even for slow CI
 *   systems. But when running tests in a debugger, set the timeout to much
 *   longer (like 1 hour) so that you'll have time to debug tests. If a string
 *   is provided, it'll be parsed into a number before evaluation, which makes
 *   it easier for callers to pass environment variables as-is. NaN values will
 *   silently be assigned the default value.
 * @property {boolean=} updateExpectedFailureFiles Used in local development to
 *   automatically revise expected-failure files after making code changes that
 *   fix test failures, removing tests that were expected to fail but now pass
 *   from the expected-failure files. This option does not add newly failing
 *   tests to the expected-failure files - this must be done manually.
 * @property {number=} maxFailures Whether to stop executing test files after a
 *   certain number of failures have been reached. Useful for preventing your
 *   console from becoming overwhelmed.
 *
 * @param {Options} options Object with the following properties:
 *   - `polyfillCodeFile: string` - Filename of the Temporal polyfill. Must be a
 *     single ECMAScript file that contains the Temporal object injected into
 *     the global namespace, as well as Temporal-related changes polyfilled into
 *     `Intl` and `Date` built-in objects.
 *   - `test262Dir: string` - Root directory of the test262 submodule repo
 *   - `testGlobs?: string[]` - If omitted, all Temporal tests will be run. This
 *     option provides glob patterns that specify a subset of tests to be run.
 *     Globs are resolved relative to `test/**∕Temporal/` subdirectories of
 *     `test262Dir`. If a pattern doesn't match any files relative to
 *     `test/**∕Temporal/`, it will also try to match relative to the current
 *     working directory, so that tab completion works. Example:
 *     `['PlainDateTime/**', 'prototype/with/*.js']`
 *   - `expectedFailureFiles?: string[]` - Optional array of text filenames that
 *     each contain a list of test files (relative to the `test` subdirectory of
 *     `test262Dir`) that are expected to fail. Lines starting with `#` and
 *     blank lines are ignored. Lines from multiple files will be concatenated
 *     and de-duped.
 *   - `timeoutMsecs?: number|string` - Optional number of milliseconds to allow
 *     tests to run before they'll be terminated. This ensures that
 *     infinite-loop (or super-long) tests won't prevent others from completing.
 *     Default is 2000 msecs (2 seconds) which should be fine even for slow CI
 *     systems. But when running tests in a debugger, set the timeout to much
 *     longer (like 1 hour) so that you'll have time to debug tests. If a string
 *     is provided, it'll be parsed into a number before evaluation, which makes
 *     it easier for callers to pass environment variables as-is. NaN values
 *     will silently be assigned the default value.
 *  - `updateExpectedFailureFiles`: boolean - Used in local development to
 *     automatically revise expected-failure files after making code changes that
 *     fix test failures, removing tests that were expected to fail but now pass
 *     from the expected-failure files. This option does not add newly failing
 *     tests to the expected-failure files - this must be done manually.
 *  - `maxFailures?: number` - Whether to stop executing test files after a
 *     certain number of failures have been reached. Useful for preventing your
 *     console from becoming overwhelmed.
 * @returns {boolean} `true` if all tests completed as expected, `false` if not.
 */
export default function runTest262({
  test262Dir,
  testGlobs,
  polyfillCodeFile,
  expectedFailureFiles,
  timeoutMsecs,
  updateExpectedFailureFiles,
  maxFailures
}) {
  // Default timeout is 2 seconds. Set a longer timeout for running tests under
  // a debugger.
  timeoutMsecs = parseInt(timeoutMsecs);
  if (typeof timeoutMsecs === 'undefined' || isNaN(timeoutMsecs)) timeoutMsecs = 2000;

  // In the test262 repo, the actual tests are contained in a /test directory
  const testSubdirectory = path.resolve(test262Dir, 'test');

  // Time the whole thing from start to finish
  const start = process.hrtime.bigint();

  // === Utilities and constants ===

  function print(str) {
    process.stdout.write(str + '\n');
  }

  // Fancy output only if stdout is a terminal
  color.enabled = process.stdout.isTTY;

  // Front matter consists of a YAML document in between /*--- and ---*/
  const frontmatterMatcher = /\/\*---\n(.*)---\*\//ms;

  const GLOB_OPTS = { filesOnly: true };

  // EX_NOINPUT -- An input file (not a system file) did not exist or was not readable.
  const EX_NOINPUT = 66;

  // === Preparation ===

  // Prepare Temporal polyfill. This vm.Script gets executed once for each test,
  // in a fresh VM context.

  const polyfillCode = fs.readFileSync(polyfillCodeFile, UTF8);
  const polyfill = new vm.Script(polyfillCode, { filename: path.resolve(polyfillCodeFile) });

  let expectedFailureLists = new Map();
  if (expectedFailureFiles) {
    for (const expectedFailureFile of expectedFailureFiles) {
      // Read the expected failures file and put the paths into a Set
      const files = new Set(fs
        .readFileSync(expectedFailureFile, UTF8)
        .split(/\r?\n/g)
        .filter((line) => line && line[0] !== '#'));
      expectedFailureLists.set(expectedFailureFile, files);
    }
  }

  // This function returns a list of any expected-failure files that mention the
  // given test filename, or undefined if no lists reference the given filename.
  function getRelevantExpectedFailureLists(testFile) {
    const ret = [];
    for (const [expectedFailureFile, expectedFailureTestsSet] of expectedFailureLists) {
      if (expectedFailureTestsSet.has(testFile)) ret.push(expectedFailureFile);
    }
    return ret.length > 0 ? ret : undefined;
  }

  // This function reads in a test262 harness helper file, specified in 'includes'
  // in the frontmatter, and caches the resulting vm.Script so it can be used in
  // future tests that also include it.

  const helpersCache = new Map();
  function getHelperScript(includeName) {
    if (helpersCache.has(includeName)) return helpersCache.get(includeName);

    const includeFile = path.join(test262Dir, 'harness', includeName);
    const includeCode = fs.readFileSync(includeFile, UTF8);
    const include = new vm.Script(includeCode, {filename: path.resolve(includeFile)});

    helpersCache.set(includeName, include);
    return include;
  }

  // Weed out common error case for people who have just cloned the repo
  if (!fs.statSync(testSubdirectory).isDirectory()) {
    print(color.yellow("Missing Test262 directory. Try initializing the submodule with 'git submodule update --init'"));
    process.exit(EX_NOINPUT);
  }

  const globResults = testGlobs.flatMap((testGlob) => {
    let result = globSync(path.resolve(testSubdirectory, `**/Temporal/${testGlob}`), GLOB_OPTS);

    // Fall back to globbing relative to working directory if that didn't match
    // anything, in case user is using tab completion
    if (result.length === 0) {
      result = globSync(testGlob, GLOB_OPTS);
    }

    result = result.filter((name) => name.endsWith('.js'));
    if (result.length === 0) {
      print(color.yellow(`No test files found for pattern: "${testGlob}"`));
    }
    return result;
  });

  if (testGlobs.length === 0) {
    [
      path.resolve(testSubdirectory, '**/Temporal/**/*.js'),
      // e.g. intl402/DateTimeFormat/prototype/format/temporal-objects-resolved-time-zone.js
      path.resolve(testSubdirectory, 'intl402/**/*[tT]emporal*.js'),
      // Intl tests related to time zones
      // e.g. intl402/DateTimeFormat/timezone-case-insensitive.js
      path.resolve(testSubdirectory, 'intl402/DateTimeFormat/**/*[zZ]one*.js'),
      // "p*" is a workaround because there is no toTemporalInstant dir at this time
      path.resolve(testSubdirectory, 'built-ins/Date/p*/toTemporalInstant/*.js')
    ].forEach((defaultGlob) => globResults.push(...globSync(defaultGlob, GLOB_OPTS)));
  }

  const testFiles = new Set(globResults);
  const total = testFiles.size;
  if (total === 0) {
    print('Nothing to do.');
    process.exit(EX_NOINPUT);
  }

  // Set up progress bar; don't print one if stdout isn't a terminal, instead use
  // a mock object. (You can force that case by piping the output to cat)
  let progress;
  if (process.stdout.isTTY) {
    progress = new ProgressBar(':bar :percent (:current/:total) | :etas | :test', {
      total,
      complete: '\u2588',
      incomplete: '\u2591',
      width: 20,
      stream: process.stdout,
      renderThrottle: 50,
      clear: true
    });
  } else {
    progress = new (class FakeProgressBar {
      #done = 0;

      tick(delta = 1) {
        this.#done += delta;
        // Do print _something_ every 100 tests, so that there is something to
        // look at in the CI while it is in progress.
        if (delta && this.#done % 100 === 0) {
          const elapsed = Number(process.hrtime.bigint() - start) / 1_000_000_000;
          print(`${this.#done} tests completed in ${elapsed.toFixed(1)} seconds.`);
        }
      }

      interrupt() {}
    })();
  }

  const failures = [];
  // Map from Expected Failure file to a Set of unexpected passing tests
  const unexpectedPasses = new Map();
  const longTests = [];
  let passCount = 0;
  let expectedFailCount = 0;
  let unexpectedPassCount = 0;
  let skippedCount = 0;

  // === The test loop ===
  for (const testFile of testFiles) {
    // Skip test if over the max-failure limit
    if (maxFailures && failures.length >= maxFailures) {
      skippedCount++;
      continue;
    }

    // Set up the VM context with the polyfill first, as if it were built-in
    const testContext = {};
    vm.createContext(testContext);
    polyfill.runInContext(testContext);

    // To proceed, we will now need to read the frontmatter
    let testCode = fs.readFileSync(testFile, UTF8);
    // Various forms of the test's path and filename. testRelPath matches what
    // is given in the expected failures file. testDisplayName is a slightly
    // abbreviated form that we use in logging during the run to make it more
    // likely to fit on one line. progressDisplayName is what's displayed beside
    // the progress bar: testDisplayName with the actual test filename cut off,
    // since the individual tests go by too fast to read anyway.
    const testRelPath = path.relative(testSubdirectory, testFile);

    // Include a sourceURL so that when tests are run in a debugger they can be
    // found using the names listed in the expected-failures-style files.
    testCode += `\n//# sourceURL=file://${testFile}`;

    const frontmatterString = frontmatterMatcher.exec(testCode)?.[1] ?? '';
    const frontmatter = yaml.load(frontmatterString);

    const { flags = [], includes = [] } = frontmatter ?? {};

    // Load whatever helpers the test specifies. As per the test262 execution
    // instructions, assert.js and sta.js are always executed even if not
    // specified, unless the raw flag is given.
    if (!flags.includes('raw')) includes.unshift('assert.js', 'sta.js');
    includes.forEach((includeName) => {
      getHelperScript(includeName).runInContext(testContext);
    });

    const testDisplayName = testRelPath
      .replace('built-ins/Temporal/', '')
      .replace('intl402/Temporal/', '(intl) ')
      .replace('staging/Temporal/', '(staging) ')
      .replace('/prototype/', '/p/');
    const progressDisplayName = path.dirname(testDisplayName);
    progress.tick(0, { test: progressDisplayName });
    // string[] of expected-failure.txt-style files that expect this test to
    // fail, or undefined if no files expect this testcase to fail
    const expectedFailureLists = getRelevantExpectedFailureLists(testRelPath);

    // Time each test individually in order to report if they take longer than
    // 100 ms
    const testStart = process.hrtime.bigint();

    // Run the test and log a message above the progress bar if the result is not
    // what it's supposed to be. This is so that you don't have to wait until the
    // end to see if your test failed.
    try {
      const testScript = new vm.Script(testCode, { filename: testFile });
      testScript.runInContext(testContext, { timeout: timeoutMsecs });

      if (!expectedFailureLists) {
        passCount++;
      } else {
        unexpectedPassCount++;
        progress.interrupt(`UNEXPECTED PASS: ${testDisplayName}`);
        for (const list of expectedFailureLists) {
          if (!unexpectedPasses.has(list)) {
            unexpectedPasses.set(list, new Set());
          }
          unexpectedPasses.get(list).add(testRelPath);
        }
      }
    } catch (e) {
      if (expectedFailureLists) {
        expectedFailCount++;
      } else {
        failures.push({ file: testRelPath, error: e });
        progress.interrupt(`FAIL: ${testDisplayName}`);
      }
    }

    const testFinish = process.hrtime.bigint();
    const testTime = testFinish - testStart;
    if (testTime > 100_000_000n) {
      longTests.push({ file: testRelPath, ns: testTime });
    }

    progress.tick(1, { test: progressDisplayName });
  }

  // === Print results ===

  const finish = process.hrtime.bigint();
  const elapsed = Number(finish - start) / 1_000_000_000;

  print(color.underline('\nSummary of results:'));
  let hasFailures = false;
  if (failures.length > 0) {
    hasFailures = true;
    failures.forEach(({ file, error }) => {
      print(color.yellow(`\n${color.bold('FAIL')}: ${file}`));
      if (error.constructor.name === 'Test262Error') {
        print(` \u2022 ${error.message}`);
      } else {
        print(util.inspect(error, { colors: color.enabled }));
      }
    });
  }

  if (unexpectedPasses.size > 0) {
    hasFailures = true;
    if (updateExpectedFailureFiles) {
      print(`\n${color.yellow.bold('WARNING:')} Tests passed unexpectedly; the following tests have been removed from their respective files:`);
    } else {
      print(`\n${color.yellow.bold('WARNING:')} Tests passed unexpectedly; remove them from their respective files?`);
    }
    for (const [expectedFailureFile, unexpectedPassesSet] of unexpectedPasses) {
      if (updateExpectedFailureFiles) updateExpectedFailureFile(expectedFailureFile, unexpectedPassesSet);
      print(` \u2022  ${expectedFailureFile}:`);
      for (const unexpectedPass of unexpectedPassesSet) {
        print(`${unexpectedPass}`);
      }
    }
  }

  if (longTests.length > 0) {
    print('\nThe following tests took a long time:');
    longTests.forEach(({ file, ns }) => {
      const ms = Math.round(Number(ns) / 1_000_000);
      print(`  ${color.yellow(ms)} ms${ms >= timeoutMsecs ? ' (timeout)' : ''}: ${file}`);
    });
  }

  print(`\n${total} tests finished in ${color.bold(elapsed.toFixed(1))} s`);
  print(color.green(`  ${passCount} passed`));
  print(color.red(`  ${failures.length} failed`));
  print(color.red(`  ${unexpectedPassCount} passed unexpectedly`));

  if (expectedFailCount > 0) {
    print(color.cyan(`  ${expectedFailCount} expected failures`));
  }
  if (skippedCount > 0) {
    print(color.grey(`  ${skippedCount} skipped`));
  }

  return !hasFailures;
}

function updateExpectedFailureFile(fileName, expectedFailuresInFile) {
    const linesOnDisk = fs
        .readFileSync(fileName, UTF8)
        .split(/\r?\n/g);
    const output = linesOnDisk.filter(l => !expectedFailuresInFile.has(l));
    fs.writeFileSync(fileName, output.join('\n'), UTF8);
}
