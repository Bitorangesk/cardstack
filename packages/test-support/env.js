const temp = require('./temp-helper');
const ElasticAssert = require('@cardstack/elasticsearch/test-support');
const JSONAPIFactory = require('./jsonapi-factory');
const crypto = require('crypto');
const { wireItUp, loadSeeds } = require('@cardstack/hub/main');
const { partition } = require('lodash');
const defaultDataSourceId = 'default-data-source';

exports.defaultDataSourceId = defaultDataSourceId;

exports.createDefaultEnvironment = async function(projectDir, initialModels = [], opts = {}) {
  let container;
  try {
    let factory = new JSONAPIFactory();
    factory.importModels(initialModels);

    factory.addResource('content-types', 'test-users').withRelated('fields', [
      factory.addResource('fields', 'full-name').withAttributes({
        fieldType: '@cardstack/core-types::string'
      }),
      factory.addResource('fields', 'email').withAttributes({
        fieldType: '@cardstack/core-types::string'
      })

    ]);

    let user = factory.addResource('test-users', 'the-default-test-user').withAttributes({
      fullName: 'Default Test Environment',
      email: 'test@example.com'
    }).asDocument();

    let defaultDataSource = new JSONAPIFactory();
    defaultDataSource.addResource('plugin-configs', '@cardstack/hub')
      .withRelated(
        'default-data-source',
        defaultDataSource.addResource('data-sources', defaultDataSourceId)
          .withAttributes({
            'source-type': '@cardstack/ephemeral'
          })
      );

    factory.addResource('grants')
      .withAttributes({
        mayReadResource: true,
        mayCreateResource: true,
        mayUpdateResource: true,
        mayDeleteResource: true,
        mayReadFields: true,
        mayWriteFields: true,
        mayLogin: true
      }).withRelated('who', [{ type: user.data.type, id: user.data.id }]);

    let [
      foreignInitialModels,
      ephemeralInitialModels
    ] = partitionInitialModels(factory.getModels());

    opts.disableAutomaticIndexing = true;
    opts.seeds = () => ephemeralInitialModels;

    container = await wireItUp(projectDir, crypto.randomBytes(32), defaultDataSource.getModels(), opts);
    if (foreignInitialModels.length) {
      await loadSeeds(container, foreignInitialModels);
    } else {
      await container.lookup('hub:indexers').update({ forceRefresh: true });
    }

    let session = container.lookup('hub:sessions').create('test-users', 'the-default-test-user');

    Object.assign(container, {
      session,
      user,
      async setUserId(id) {
        let plugins = await this.lookup('hub:plugins').active();
        let m = plugins.lookupFeatureAndAssert('middleware', '@cardstack/test-support-authenticator');
        m.userId = id;
      }
    });
    return container;
  } catch (err) {
    // don't leave a half-constructed environment lying around if we
    // failed. Cleanup whatever parts were already created.
    if (container) {
      container.teardown();
    }
    destroyIndices();
    temp.cleanup();
    throw err;
  }
};

exports.destroyDefaultEnvironment = async function(env) {
  if (env) {
    env.teardown();
    await env.teardownSettled();
    await destroyIndices();
    await temp.cleanup();
  }
};

async function destroyIndices() {
  let ea = new ElasticAssert();
  await ea.deleteContentIndices();
}


function partitionInitialModels(initialModels) {
  let hasNonDefaultSource = Object.create(null);
  for (let model of initialModels) {
    if (model.type === 'content-types') {
      let sourceId;
      if (model.relationships &&
          model.relationships['data-source'] &&
          (sourceId = model.relationships['data-source'].data) &&
          sourceId !== defaultDataSourceId
         ) {
        hasNonDefaultSource[model.id] = true;
      }
    }
  }
  return partition(initialModels, m => hasNonDefaultSource[m.type]);
}
