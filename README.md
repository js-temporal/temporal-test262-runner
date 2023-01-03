
# Lightweight runner for ECMAScript Temporal's Test262 tests

This package provides a fast way for polyfills of ECMAScript
[`Temporal`](https://github.com/tc39/proposal-temporal) to run Temporal's 5,000+
Test262 tests. Test262 (https://github.com/tc39/test262) is the official
conformance test suite for ECMAScript, and this package quickly runs a subset of
those tests that are specific to Temporal. All Temporal polyfills should pass
Test262.

This runner is much faster than
[`test262-harness`](https://github.com/bterlson/test262-harness) (the default
Test262 harness) because:
* It runs only 5000+ Temporal-specific tests, instead of the full suite.
* It pre-parses the Temporal polyfill into a
  [`vm.Script`](https://nodejs.org/api/vm.html#class-vmscript), instead of
  reading and parsing the whole file once for each test like the prelude option
  of `test262-harness` does.

For code coverage, set the environment variable `NODE_V8_COVERAGE` to the path
(relative to the working directory) where coverage metrics should be output.
These can be processed with the [`c8`](https://github.com/bcoe/c8) tool. NOTE:
as of Node 18.7 there is a memory leak that makes it impossible to run the
entire suite with NODE_V8_COVERAGE, so for code coverage tests you should run it
in chunks.

## Example Usage

```js
import runTest262 from 'temporal-test262-runner';

const result = runTest262({
  test262Dir: 'test262',
  polyfillCodeFile: 'dist/script.js',
  expectedFailureFiles: ['test/expected-failures.txt'],
  testGlobs: process.argv.slice(2)
});

// if result is `true`, all tests succeeded
process.exit(result ? 0 : 1);
```

## Options

* `polyfillCodeFile: string` - Filename of the Temporal polyfill. Must
  be a single ECMAScript file that contains the Temporal object injected into
  the global namespace, as well as Temporal-related changes polyfilled into
  `Intl` and `Date` built-in objects.
* `test262Dir: string` - Root directory of the test262 submodule repo.
* `testGlobs?: string[]` - If omitted, all tests will be run. This option
  provides glob patterns that specify a subset of tests to be run. Globs are
  resolved relative to `test/**/Temporal/` subdirectories of `test262Dir`. If a
  pattern doesn't match any files relative to `test/**/Temporal/`, it will also
  try to match relative to the current working directory, so that tab completion
  works. Example: `[ 'PlainDateTime/**', 'prototype/with/*.js' ]`
* `expectedFailureFiles?: string[]` Optional array of text filenames
  that each contain a list of test files (relative to the `test` subdirectory
  of `test262Dir`) that are expected to fail. Lines starting with `#` and
  blank lines are ignored. Lines from multiple files will be concatenated and
  de-duped. Example:
  ```
  # https://github.com/tc39/test262/pull/3548
  built-ins/Temporal/Duration/compare/argument-string-negative-fractional-units.js
  built-ins/Temporal/Duration/from/argument-string-negative-fractional-units.js
  ```
