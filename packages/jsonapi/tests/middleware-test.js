const jsonapi = require('@cardstack/jsonapi/middleware');
const supertest = require('supertest');
const Koa = require('koa');
const {
  createDefaultEnvironment,
  destroyDefaultEnvironment
} = require('@cardstack/server/tests/support');
const { currentVersion } = require('./support');
const JSONAPIFactory = require('@cardstack/test-support/jsonapi-factory');
const { grantAllPermissions } = require('@cardstack/test-support/permissions');

describe('jsonapi', function() {

  let request, env;

  beforeEach(async function() {
    let factory = new JSONAPIFactory();
    let articleType = factory.addResource('content-types', 'articles');

    articleType.withRelated(
      'data-source',
      { type: 'data-sources', id: 'default-git' }
    );

    articleType.withRelated('fields', [
      factory.addResource('fields', 'title')
        .withAttributes({ fieldType: 'string' }),
      factory.addResource('fields', 'body')
        .withAttributes({ fieldType: 'string' })
        .withRelated('constraints', [
          factory.addResource('constraints')
            .withAttributes({ constraintType: 'not-null' })
        ])
    ]);

    factory.addResource('content-types', 'events')
      .withRelated('fields', [
        factory.getResource('fields', 'title')
      ]);

    grantAllPermissions(factory);

    factory.addResource('articles', 0)
      .withAttributes({
          title: "Hello world",
          body: "This is the first article"
      });

    factory.addResource('articles', 1)
      .withAttributes({
        title: "Second",
        body: "This is the second article"
      });

    factory.addResource('comments', 0)
      .withAttributes({
        body: "This is s a comment"
      });

    env = await createDefaultEnvironment(factory.getModels());
    let app = new Koa();
    app.use(jsonapi(env.searcher, env.writers));
    request = supertest(app.callback());
  }),

  afterEach(async function() {
    await destroyDefaultEnvironment(env);
  }),

  it('can get an individual resource', async function() {
    let response = await request.get('/articles/0');
    expect(response).hasStatus(200);
    expect(response.body).deep.property('data.id', '0');
    expect(response.body).deep.property('data.attributes.title', 'Hello world');
    expect(response.body).not.deep.property('data.relationships');
  });

  it('returns 404 for missing individual resource', async function() {
    let response = await request.get('/articles/98766');
    expect(response).hasStatus(404);
    expect(response.body).to.have.deep.property('errors[0].detail', 'No such resource /articles/98766');
  });

  it('can get a collection resource', async function() {
    let response = await request.get('/articles');
    expect(response).hasStatus(200);
    expect(response.body).to.have.property('data');
    expect(response.body).to.have.deep.property('meta.total', 2);
    expect(response.body.data).length(2);
    expect(response.body.data).collectionContains({ type: 'articles', id: '0' });
    expect(response.body.data).collectionContains({ type: 'articles', id: '1' });
  });

  it('can sort a collection resource', async function() {
    let response = await request.get('/articles?sort=title');
    expect(response).hasStatus(200);
    expect(response.body).to.have.property('data');
    expect(response.body).has.deep.property('data[0].attributes.title', 'Hello world');
    expect(response.body).has.deep.property('data[1].attributes.title', 'Second');
  });

  it('can reverse sort a collection resource', async function() {
    let response = await request.get('/articles?sort=-title');
    expect(response).hasStatus(200);
    expect(response.body).has.property('data');
    expect(response.body).has.deep.property('data[1].attributes.title', 'Hello world');
    expect(response.body).has.deep.property('data[0].attributes.title', 'Second');
  });

  it('can filter a collection resource', async function() {
    let response = await request.get('/articles?filter[title]=world');
    expect(response).hasStatus(200);
    expect(response.body).has.property('data');
    expect(response.body.data).length(1);
    expect(response.body).has.deep.property('data[0].attributes.title', 'Hello world');
  });

  it('can paginate a collection resource', async function() {
    let response = await request.get('/articles?page[size]=1&sort=title');
    expect(response).hasStatus(200, 'first request');
    expect(response.body.data).length(1);
    expect(response.body).has.deep.property('data[0].attributes.title', 'Hello world');
    expect(response.body).has.deep.property('links.next');

    response = await request.get(response.body.links.next);
    expect(response).hasStatus(200, 'second request');
    expect(response.body).has.deep.property('data[0].attributes.title', 'Second');
    expect(response.body.data).length(1);
  });

  it('gets 403 when creating unknown resource', async function() {
    let response = await request.post('/bogus').send({
      data: {
        type: 'bogus',
        attributes: {
          title: 'I am new'
        }
      }
    });
    expect(response.status).to.equal(403);
    expect(response.body).has.deep.property('errors[0].detail', '"bogus" is not a writable type');
  });

  it('gets 400 when creating a resource with no body', async function() {
    let response = await request.post('/articles');
    expect(response.status).to.equal(400);
    expect(response.body).has.deep.property('errors[0].detail', 'A body with a top-level "data" property is required');
  });

  it('gets 400 when creating a resource with no data property', async function() {
    let response = await request.post('/articles').send({datum: {}});
    expect(response.status).to.equal(400);
    expect(response.body).has.deep.property('errors[0].detail', 'A body with a top-level "data" property is required');
  });


  it('can create a new resource', async function() {
    let response = await request.post('/articles').send({
      data: {
        type: 'articles',
        attributes: {
          title: 'I am new',
          body: 'xxx'
        }
      }
    });

    expect(response).hasStatus(201);
    expect(response.headers).has.property('location');
    expect(response.body).has.deep.property('data.id');
    expect(response.body).has.deep.property('data.attributes.title', 'I am new');
    expect(response.body).has.deep.property('data.meta.version');

    await env.indexer.update({ realTime: true });

    response = await request.get(response.headers.location);
    expect(response).hasStatus(200);
    expect(response.body).has.deep.property('data.attributes.title', 'I am new', 'second time');

  });

  it('can update an existing resource', async function() {
    let version = await currentVersion(request, '/articles/0');

    let response = await request.patch('/articles/0').send({
      data: {
        id: '0',
        type: 'articles',
        attributes: {
          title: 'Updated title'
        },
        meta: { version }
      }
    });

    expect(response).hasStatus(200);
    expect(response).has.deep.property('body.data.attributes.title', 'Updated title');
    expect(response).has.deep.property('body.data.attributes.body', "This is the first article");

    await env.indexer.update({ realTime: true });

    response = await request.get('/articles/0');
    expect(response).hasStatus(200);
    expect(response).has.deep.property('body.data.attributes.title', 'Updated title', 'second time');
    expect(response).has.deep.property('body.data.attributes.body', "This is the first article", 'second time');

  });

  it('gets 404 when patching a missing resource', async function() {
    let version = await currentVersion(request, '/articles/0');

    let response = await request.patch('/articles/100').send({
      data: {
        id: '100',
        type: 'articles',
        attributes: {
          title: 'Updated title'
        },
        meta: { version }
      }
    });
    expect(response.status).to.equal(404);
    expect(response.body).has.deep.property('errors[0].detail', 'articles with id 100 does not exist');
  });

  it('refuses to delete without version', async function() {
    let response = await request.delete('/articles/0');
    expect(response).hasStatus(400);
    expect(response.body).has.deep.property('errors[0].detail', "version is required");
    expect(response.body).has.deep.property('errors[0].source.header', 'If-Match');
  });

  it('refuses to delete with invalid version', async function() {
    let response = await request.delete('/articles/0').set('If-Match', 'xxx');
    expect(response).hasStatus(400);
    expect(response.body).has.deep.property('errors[0].source.header', 'If-Match');
  });

  it('can delete a resource', async function() {
    let version = await currentVersion(request, '/articles/0');

    let response = await request.delete('/articles/0').set('If-Match', version);
    expect(response).hasStatus(204);

    await env.indexer.update({ realTime: true });

    response = await request.get('/articles/0');
    expect(response).hasStatus(404);
  });

  it('validates schema during POST', async function() {
    let response = await request.post('/articles').send({
      data: {
        type: 'articles',
        attributes: {
          title: 3
        }
      }
    });
    expect(response).hasStatus(400);
    expect(response.body.errors).length(2);
    expect(response.body.errors).collectionContains({
      title: 'Validation error',
      detail: '3 is not a valid value for field "title"',
      source: { pointer: '/data/attributes/title' }
    });
    expect(response.body.errors).collectionContains({
      title: 'Validation error',
      detail: 'the value of field "body" may not be null',
      source: { pointer: '/data/attributes/body' }
    });
  });

  it('validates schema during PATCH', async function() {
    let version = await currentVersion(request, '/articles/0');
    let response = await request.patch('/articles/0').send({
      data: {
        id: '0',
        type: 'articles',
        attributes: {
          title: 3
        },
        meta: { version }
      }
    });
    expect(response.status).to.equal(400);

    // we should not hit the body not-null constraint here, since
    // we're leaving it unchanged
    expect(response.body.errors).length(1);

    expect(response.body.errors).collectionContains({
      title: 'Validation error',
      detail: '3 is not a valid value for field "title"',
      source: { pointer: '/data/attributes/title' }
    });
  });

});
