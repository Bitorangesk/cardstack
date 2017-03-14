const Schema = require('@cardstack/server/schema');
const ElasticAssert = require('@cardstack/elasticsearch/tests/assertions');
const JSONAPIFactory = require('@cardstack/test-support/jsonapi-factory');

describe('schema/auth', function() {

  let factory;

  beforeEach(async function() {
    factory = new JSONAPIFactory();

    factory.addResource('content-types', 'articles')
      .withRelated('fields', [
        factory.addResource('fields', 'title')
          .withAttributes({ fieldType: 'string' }),
        factory.addResource('fields', 'published-date')
          .withAttributes({
            fieldType: 'date'
          })
      ]);

    factory.addResource('content-types', 'events')
      .withRelated('fields', [
        factory.getResource('fields', 'title')
      ]);

  });

  afterEach(async function() {
    let ea = new ElasticAssert();
    await ea.deleteAllIndices();
  });

  it("forbids creation", async function() {
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not create this resource'
    });
  });

  it("unrestricted grant allows creation", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true });
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).deep.equal([]);
  });

  it("user-specific grant allows creation", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true })
      .withRelated('who', { types: 'groups', id: '0' });
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action, { user: { id: 0 }});
    expect(errors).deep.equal([]);
  });

  it("user-specific grant doesn't match missing user", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true })
      .withRelated('who', { types: 'groups', id: '0' });
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not create this resource'
    });
  });

  it("user-specific grant doesn't match wrong user", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true })
      .withRelated('who', { types: 'groups', id: '0' });
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action, { user: { id: 1 }});
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not create this resource'
    });
  });

  it("allows by type", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true })
      .withRelated('types', [factory.getResource('content-types', 'articles')]);
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).deep.equal([]);
  });

  it("forbids by type", async function() {
    factory.addResource('grants').withAttributes({ mayCreateResource: true })
      .withRelated('types', [factory.getResource('content-types', 'articles')]);
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'events',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not create this resource'
    });
  });

  it("forbids deletion", async function() {
    let schema = await Schema.loadFrom(factory.getModels());
    let action = deleteIt({
      type: 'articles',
      id: '1'
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not delete this resource'
    });
  });

  it("forbids update", async function() {
    let schema = await Schema.loadFrom(factory.getModels());
    let action = update({
      type: 'articles',
      id: '1',
      attributes: {
        title: 'x'
      }
    },{
      type: 'articles',
      id: '1',
      attributes: {
        title: 'y'
      }
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not update this resource'
    });
  });

  it.skip("approves field write at creation via grant", async function () {

  });

  it.skip("approves field write at creation via default value", async function () {

  });

  it.skip("rejects field write at creation", async function () {
    factory.addResource('grants').withAttributes({ mayCreateResource: true });
    let schema = await Schema.loadFrom(factory.getModels());
    let action = create({
      type: 'articles',
      id: '1',
      attributes: {
        title: "hello"
      }
    });
    let errors = await schema.validationErrors(action);
    expect(errors).collectionContains({
      status: 401,
      detail: 'You may not write field "title"'
    });
  });

  it.skip("approves field write at update via grant", async function () {

  });

  it.skip("approves field write at update via unchanged value", async function () {

  });

  it.skip("rejects field write at update", async function () {

  });

});

function create(document) {
  return {
    finalDocument: document,
    originalDocument: null
  };
}

function deleteIt(document) {
  return {
    finalDocument: null,
    originalDocument: document
  };
}

function update(older, newer) {
  return {
    finalDocument: newer,
    originalDocument: older
  };
}

async function validationErrors(change, context) {
  try {
    await this.validate(change, context);
    return [];
  } catch (err) {
    if (!err.isCardstackError) { throw err; }
    if (err.additionalErrors) {
      return [err].concat(err.additionalErrors);
    } else {
      return [err];
    }
  }
}
