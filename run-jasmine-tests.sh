#!/bin/bash

BASEDIR=$(dirname $0)

JASMINE_DIR="$BASEDIR/test"

if [ $1 ]
then
    TESTS_PATH=${JASMINE_DIR}/$1
else
    TESTS_PATH=${JASMINE_DIR}
fi

${BASEDIR}/node_modules/.bin/jasmine-node --noColor --verbose --captureExceptions false $TESTS_PATH