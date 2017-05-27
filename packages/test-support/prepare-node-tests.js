const chai = require('chai');
chai.use(require('chai-things'));
chai.use(require('./collection-contains'));
chai.use(require('./has-status'));

const defaultDebugChannels = '*,-eslint:*,-koa:*,-koa-*,-superagent';

if (!process.__didSetCardstackWarning) {
  process.__didSetCardstackWarning = true;
  // Without this, we can't see stack traces for certain failures within
  // promises during the test suite.
  process.on('warning', (warning) => {
    /* eslint-disable no-console */
    console.warn(warning.stack);
    /* eslint-enable no-console */
  });

  // If the user isn't customizing anything about logging, we generate
  // log messages for warnings or higher, and we install a handler that
  // will cause any unexpected log message to fail the tests.
  if (!process.env['DEBUG']) {
    // these third-party deps have loud logging even at warn level
    process.env.DEBUG=defaultDebugChannels;
    if (!process.env['DEBUG_LEVEL']) {
      process.env.DEBUG_LEVEL='warn';
    }
  }
}

if (!process.env['ELASTICSEARCH_PREFIX']) {
  // Avoid stomping on any existing content in elasticsearch by
  // namespacing the test indices differently.
  process.env['ELASTICSEARCH_PREFIX'] = 'test';
}

module.exports = function() {

  global.expect = chai.expect;

  if (process.env.DEBUG === defaultDebugChannels) {

    process.stderr.write = function(logLine) {
      let match = [...expected.keys()].find(pattern => pattern.test(logLine));
      if (match) {
        expected.set(match, expected.get(match) + 1);
      } else {
        throw new Error("Unexpected log message during tests: " + logLine);
      }
    };
    let expected = new Map();

    // a successful test suite run still gets an empty write to stderr
    // when it closes.
    expected.set(/^\w*$/, 0);

    global.expectLogMessage = async function(pattern, fn) {
      expected.set(pattern, 0);
      await fn();
      let count = expected.get(pattern);
      expected.delete(pattern);
      if (count !== 1) {
        throw new Error(`Expected a log mesage to match ${pattern} but none did`);
      }
    };
  } else {
    global.expectLogMessage = async function(pattern, fn) {
      await fn();
    };
  }
};
