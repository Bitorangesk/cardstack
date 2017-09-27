const {
  createDefaultEnvironment,
  destroyDefaultEnvironment
} = require('../../../tests/stub-project/node_modules/@cardstack/test-support/env');

describe('hub/indexers', function() {
  let env;

  before(async function () {
    env = await createDefaultEnvironment(`${__dirname}/../../../tests/stub-project`);
  });

  after(async function() {
    await destroyDefaultEnvironment(env);
  });


  it("indexes seed models", async function() {
    // this seed model comes from createDefaultEnvironment
    let response = await env.lookup('hub:searchers').search('master', { filter: { type: 'plugin-configs' }});
    expect(response.data.map(m => m.id)).includes('@cardstack/hub');
  });

  it("indexes bootstrap models", async function() {
    let response = await env.lookup('hub:searchers').search('master', { filter: { type: 'content-types' }});
    expect(response.data.map(m => m.id)).includes('content-types');
  });

});
