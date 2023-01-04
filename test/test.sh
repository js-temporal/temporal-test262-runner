#!/bin/bash

set -ex

cd test
rm -rf temporal-polyfill
git clone --recurse-submodules https://github.com/js-temporal/temporal-polyfill.git
cd temporal-polyfill
npm i
TEST262=1 npm run build
node --loader ../resolve-test.mjs ../runtest262.mjs
