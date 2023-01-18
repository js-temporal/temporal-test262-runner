#!/bin/bash

set -ex

cd test
rm -rf temporal-polyfill
git clone --recurse-submodules https://github.com/js-temporal/temporal-polyfill.git
cd temporal-polyfill
npm i --ignore-scripts --no-audit
npm link ../../ --ignore-scripts --no-audit
npm run test262
