const {
  createDefaultEnvironment,
  destroyDefaultEnvironment
} = require('@cardstack/hub/node-tests/support');
const { uniq } = require('lodash');

describe('elasticsearch/searcher', function() {

  let searcher, env;
  let fixtures = [
    {
      type: 'plugin-configs',
      attributes: {
        module: '@cardstack/mobiledoc'
      }
    },
    {
      type: 'content-types',
      id: 'people',
      relationships: {
        fields: {
          data: [
            { type: 'fields', id: 'firstName' },
            { type: 'fields', id: 'lastName' },
            { type: 'fields', id: 'age' },
            { type: 'fields', id: 'color' },
            { type: 'fields', id: 'description' }
          ]
        }
      }
    },
    {
      type: 'content-types',
      id: 'comments',
      relationships: {
        fields: {
          data: [
            { type: 'fields', id: 'body' }
          ]
        }
      }
    },
    {
      type: 'content-types',
      id: 'articles',
      relationships: {
        fields: {
          data: [
            { type: 'fields', id: 'title' },
            { type: 'fields', id: 'color' },
            { type: 'fields', id: 'hello' }
          ]
        }
      }
    },
    {
      type: 'fields',
      id: 'firstName',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'body',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'hello',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'description',
      attributes: {
        'field-type': '@cardstack/mobiledoc'
      }
    },
    {
      type: 'fields',
      id: 'title',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'color',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'lastName',
      attributes: {
        'field-type': '@cardstack/core-types::string'
      }
    },
    {
      type: 'fields',
      id: 'age',
      attributes: {
        'field-type': '@cardstack/core-types::integer'
      }
    },
    {
      type: 'articles',
      id: '1',
      attributes: {
        hello: 'magic words',
        color: 'red',
      }
    },
    {
      type: 'people',
      id: '1',
      attributes: {
        firstName: 'Quint',
        lastName: 'Faulkner',
        age: 6,
        description: {
          version: "0.3.1",
          markups: [],
          atoms: [],
          cards: [],
          sections: [
            [1, "p", [
              [0, [], 0, "The quick brown fox jumps over the lazy dog."]
            ]]
          ]
        }
      }
    },
    {
      type: 'people',
      id: '2',
      attributes: {
        firstName: 'Arthur',
        lastName: 'Faulkner',
        age: 1,
        color: 'red'
      }
    }
  ];

  before(async function() {
    let records = fixtures.slice();
    for (let i = 10; i < 30; i++) {
      records.push({
        type: 'comments',
        id: String(i),
        attributes: {
          body: `comment ${i}`
        }
      });
    }
    env = await createDefaultEnvironment(records);
    searcher = env.searcher;
  });

  after(async function() {
    await destroyDefaultEnvironment();
  });

  it('can be searched for all content', async function() {
    let { models } = await searcher.search('master', {
      page: { size: 1000 }
    });
    expect(models.filter(m => m.type === 'comments')).to.have.length(20);
    expect(models.filter(m => m.type === 'people')).to.have.length(2);
    expect(models.filter(m => m.type === 'articles')).to.have.length(1);
  });

  it('can be searched via queryString', async function() {
    let { models } = await searcher.search('master', {
      queryString: 'magic'
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.hello', 'magic words');
  });

  it('can be searched via queryString, negative result', async function() {
    let { models } = await searcher.search('master', {
      queryString: 'this-is-an-unused-term'
    });
    expect(models).to.have.length(0);
  });

  it('can filter by type', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        type: 'articles'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.hello', 'magic words');
  });

  it('can filter by id', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        id: '1',
        type: ['articles', 'people']
      }
    });
    expect(models).to.have.length(2);
    expect(models).includes.something.with.property('type', 'articles');
    expect(models).includes.something.with.property('type', 'people');
  });

  it('can filter a field by one term', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        firstName: 'Quint'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Quint');
  });

  it('can filter a field by multiple terms', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        firstName: ['Quint', 'Arthur']
      }
    });
    expect(models).to.have.length(2);
  });

  it('can use OR expressions in filters', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        or: [
          { firstName: ['Quint'], type: 'people' },
          { type: 'articles', id: '1' }
        ]
      }
    });
    expect(models).to.have.length(2);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Quint');
    expect(models).includes.something.with.deep.property('type', 'articles');
  });

  it('can use AND expressions in filters', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        and: [
          { color: 'red' },
          { type: 'people' }
        ]
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Arthur');
  });


  it('can filter by range', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        age: {
          range: {
            lt: '2'
          }
        }
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Arthur');
  });

  it('can filter by field existence (string)', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        color: {
          exists: 'true'
        },
        type: 'people'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Arthur');
  });

  it('can filter by field nonexistence (string)', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        color: {
          exists: 'false'
        },
        type: 'people'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Quint' );
  });

  it('can filter by field existence (bool)', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        color: {
          exists: true
        },
        type: 'people'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Arthur');
  });

  it('can filter by field nonexistence (bool)', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        color: {
          exists: false
        },
        type: 'people'
      }
    });
    expect(models).to.have.length(1);
    expect(models).includes.something.with.deep.property('attributes.firstName', 'Quint' );
  });

  it('can search within a field with custom indexing behavior', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        description: 'fox'
      }
    });
    expect(models).to.have.length(1);
    expect(models).has.deep.property('[0].attributes.firstName', 'Quint');

    // These are the internally used fields that should not leak out
    expect(models[0].attributes).has.not.property('cardstack_derived_names');
    expect(models[0].attributes).has.not.property('description_as_text');
  });

  it('gives helpful error when filtering unknown field', async function() {
    try {
      await searcher.search('master', {
        filter: {
          flavor: 'chocolate'
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).equals(400);
      expect(err.detail).equals('Cannot filter by unknown field "flavor"');
    }
  });

  it('can sort', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        type: 'people'
      },
      sort: 'age'
    });
    expect(models.map(r => r.attributes.firstName)).to.deep.equal(['Arthur', 'Quint']);
  });


  it('can sort reverse', async function() {
    let { models } = await searcher.search('master', {
      filter: {
        type: 'people'
      },
      sort: '-age'
    });
    expect(models.map(r => r.attributes.firstName)).to.deep.equal(['Quint', 'Arthur']);
  });

  it('can sort via field-specific mappings', async function() {
    // string fields are only sortable because of the sortFieldName
    // in @cardstack/core-field-types/string. So this is a test that
    // we're using that capability.
    let { models } = await searcher.search('master', {
      filter: {
        type: 'people'
      },
      sort: 'firstName'
    });
    expect(models.map(r => r.attributes.firstName)).to.deep.equal(['Arthur', 'Quint']);
  });


  it('can sort reverse via field-specific mappings', async function() {
    // string fields are only sortable because of the sortFieldName
    // in @cardstack/core-field-types/string. So this is a test that
    // we're using that capability.
    let { models } = await searcher.search('master', {
      filter: {
        type: 'people'
      },
      sort: '-firstName'
    });
    expect(models.map(r => r.attributes.firstName)).to.deep.equal(['Quint', 'Arthur']);
  });

  it('has helpful error when sorting by nonexistent field', async function() {
    try {
      await searcher.search('master', {
        sort: 'something-that-does-not-exist'
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).equals(400);
      expect(err.detail).equals('Cannot sort by unknown field "something-that-does-not-exist"');
    }
  });

  it('can paginate', async function() {
    let response = await searcher.search('master', {
      filter: { type: 'comments' },
      page: {
        size: 7
      }
    });
    expect(response.models).length(7);
    expect(response.page).has.property('total', 20);
    expect(response.page).has.property('cursor');

    let allModels = response.models;

    response = await searcher.search('master', {
      filter: { type: 'comments' },
      page: {
        size: 7,
        cursor: response.page.cursor
      }
    });

    expect(response.models).length(7);
    expect(response.page).has.property('total', 20);
    expect(response.page).has.property('cursor');

    allModels = allModels.concat(response.models);

    response = await searcher.search('master', {
      filter: { type: 'comments' },
      page: {
        size: 7,
        cursor: response.page.cursor
      }
    });

    expect(response.models).length(6);
    expect(response.page).has.property('total', 20);
    expect(response.page).not.has.property('cursor');

    allModels = allModels.concat(response.models);

    expect(uniq(allModels.map(m => m.id))).length(20);
  });

  it('can paginate when results exactly fill final page', async function() {
    let response = await searcher.search('master', {
      filter: { type: 'comments' },
      page: {
        size: 10
      }
    });
    expect(response.models).length(10);
    expect(response.page).has.property('total', 20);
    expect(response.page).has.property('cursor');

    let allModels = response.models;

    response = await searcher.search('master', {
      filter: { type: 'comments' },
      page: {
        size: 10,
        cursor: response.page.cursor
      }
    });

    expect(response.models).length(10);
    expect(response.page).has.property('total', 20);
    expect(response.page).not.has.property('cursor');

    allModels = allModels.concat(response.models);
    expect(uniq(allModels.map(m => m.id))).length(20);
  });

  it('can get an individual record', async function() {
    let model = await searcher.get('master', 'articles', '1');
    expect(model).has.deep.property('attributes.hello', 'magic words');
  });

  it('can do analyzed term matching', async function() {
    let response = await searcher.search('master', {
      filter: {
        hello: 'magic'
      }
    });
    expect(response.models).length(1);
    expect(response.models[0]).has.deep.property('attributes.hello', 'magic words');
  });

  it('the analyzed term does not match a phrase', async function() {
    let response = await searcher.search('master', {
      filter: {
        hello: 'magic words'
      }
    });
    expect(response.models).length(0);
  });

  it('can do exact term matching with a phrase', async function() {
    let response = await searcher.search('master', {
      filter: {
        hello: { exact: 'magic words' }
      }
    });
    expect(response.models).length(1);
    expect(response.models[0]).has.deep.property('attributes.hello', 'magic words');
  });

  it('can do exact term matching with multiple phrases', async function() {
    let response = await searcher.search('master', {
      filter: {
        hello: { exact: ['something else', 'magic words'] }
      }
    });
    expect(response.models).length(1);
    expect(response.models[0]).has.deep.property('attributes.hello', 'magic words');
  });


});
