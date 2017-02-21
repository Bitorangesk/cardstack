const temp = require('./temp-helper');
const Writer = require('@cardstack/server/writer');
const { makeRepo, inRepo } = require('./git-assertions');

describe('writer', function() {

  let fixtures = [
    {
      type: 'articles',
      id: '1',
      content: {
        title: 'First Article'
      }
    },
    {
      type: 'people',
      id: '1',
      content: {
        firstName: 'Quint',
        lastName: 'Faulkner',
        age: 6
      }
    },
    {
      type: 'people',
      id: '2',
      content: {
        firstName: 'Arthur',
        lastName: 'Faulkner',
        age: 1
      }
    }
  ];

  let root, writer, user, headId;

  beforeEach(async function() {
    root = await temp.mkdir('cardstack-server-test');
    writer = new Writer({
      repoPath: root
    });
    user = {
      fullName: 'Sample User',
      email: 'user@example.com'
    };

    let { head } = await makeRepo(root, [
      {
        changes: fixtures.map(f => ({
          operation: 'create',
          filename: `contents/${f.type}/${f.id}.json`,
          buffer: Buffer.from(JSON.stringify(f.content), 'utf8')
        }))
      }
    ]);
    headId = head;
  });

  afterEach(async function() {
    await temp.cleanup();
  });

  it('saves attributes when creating a record', async function () {
    let record = await writer.create('master', user, {
      type: 'articles',
      attributes: {
        title: 'Second Article'
      }
    });
    let saved = await inRepo(root).getJSONContents('master', `contents/articles/${record.id}.json`);
    expect(saved).to.deep.equal({
      title: 'Second Article'
    });
  });

  it('returns correct document when creating a record', async function () {
    let record = await writer.create('master', user, {
      type: 'articles',
      attributes: {
        title: 'Second Article'
      }
    });
    expect(record).has.property('id');
    expect(record.attributes).to.deep.equal({ title: 'Second Article' });
    expect(record.type).to.equal('articles');
    let head = await inRepo(root).getCommit('master');
    expect(record).has.deep.property('meta.version', head.id);
  });

  it('retries on id collision', async function () {
    let ids = ['1', '1', '2'];
    let writer = new Writer({
      repoPath: root,
      idGenerator() {
        return ids.shift();
      }
    });

    let record = await writer.create('master', user, {
      type: 'articles',
      attributes: {
        title: 'Second Article'
      }
    });
    expect(ids).to.have.length(0);
    expect(record).has.property('id', '2');
  });

  it('allows optional clientside id', async function() {
    let record = await writer.create('master', user, {
      id: 'special',
      type: 'articles',
      attributes: {
        title: 'Second Article'
      }
    });
    expect(record).has.property('id', 'special');
    let articles = (await inRepo(root).listTree('master', 'contents/articles')).map(a => a.name);
    expect(articles).to.contain('special.json');
  });

  it('rejects conflicting clientside id', async function() {
    try {
      await writer.create('master', user, {
        id: '1',
        type: 'articles',
        attributes: {
          title: 'Second Article'
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).to.equal(409);
      expect(err.detail).to.match(/id 1 is already in use/);
      expect(err.source).to.deep.equal({ pointer: '/data/id' });
    }
  });

  it('requires type during create', async function() {
    try {
      await writer.create('master', user, {
        id: '1',
        attributes: {
          title: 'Second Article'
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).to.equal(400);
      expect(err.detail).to.match(/missing required field/);
      expect(err.source).to.deep.equal({ pointer: '/data/type' });
    }
  });

  it('requires id on update documents', async function() {
    try {
      await writer.update('master', user, {
        type: 'articles',
        attributes: {
          title: 'Updated title'
        },
        meta: {
          version: headId
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      expect(err.status).to.equal(400);
      expect(err.detail).to.match(/missing required field/);
      expect(err.source).to.deep.equal({ pointer: '/data/id' });
    }
  });

  it('requires type during update', async function() {
    try {
      await writer.update('master', user, {
        id: '1',
        attributes: {
          title: 'Updated title'
        },
        meta: {
          version: headId
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).to.equal(400);
      expect(err.detail).to.match(/missing required field/);
      expect(err.source).to.deep.equal({ pointer: '/data/type' });
    }
  });

  it('rejects update of missing document', async function() {
    try {
      await writer.update('master', user, {
        id: '10',
        type: 'articles',
        attributes: {
          title: 'Updated title'
        },
        meta: {
          version: headId
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).to.equal(404);
      expect(err.title).to.match(/not found/i);
      expect(err.source).to.deep.equal({ pointer: '/data/id' });
    }
  });


  let badMetas = [undefined, null, 0, 1, {}, { version: null }, { version: 0 }, { version: "" }];

  for (let meta of badMetas) {
    it(`refuses to update without meta version (${JSON.stringify(meta)})`, async function() {
      try {
        let doc = {
          id: '1',
          type: 'articles',
          attributes: {
            title: 'Updated title'
          }
        };
        if (meta !== undefined) {
          doc.meta = meta;
        }
        await writer.update('master', user, doc);
        throw new Error("should not get here");
      } catch (err) {
        expect(err.status).to.equal(400);
        expect(err.detail).to.match(/missing required field/);
        expect(err.source).to.deep.equal({ pointer: '/data/meta/version' });
      }
    });
  }

  let badVersions = ["0", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "not-a-version"];

  for (let version of badVersions) {
    it(`rejects invalid version ${version}`, async function() {
      try {
        await writer.update('master', user, {
          id: '1',
          type: 'articles',
          attributes: {
            title: 'Updated title'
          },
          meta: {
            version
          }
        });
        throw new Error("should not get here");
      } catch (err) {
        if (err.status == null) {
          throw err;
        }
        expect(err.status).to.equal(400);
        expect(err.source).to.deep.equal({ pointer: '/data/meta/version' });
      }
    });
  }

  it('returns updated document', async function() {
    let record = await writer.update('master', user, {
      id: '1',
      type: 'articles',
      attributes: {
        title: 'Updated title'
      },
      meta: {
        version: headId
      }
    });
    expect(record).has.deep.property('attributes.title', 'Updated title');
    expect(record).has.deep.property('meta.version').not.equal(headId);
  });

  it('stores updated attribute', async function() {
    await writer.update('master', user, {
      id: '1',
      type: 'articles',
      attributes: {
        title: 'Updated title'
      },
      meta: {
        version: headId
      }
    });
    expect(await inRepo(root).getJSONContents('master', 'contents/articles/1.json'))
      .property('title', 'Updated title');
  });

  it('reports merge conflict during update', async function() {
    await writer.update('master', user, {
      id: '1',
      type: 'articles',
      attributes: {
        title: 'Updated title'
      },
      meta: {
        version: headId
      }
    });

    try {
      await writer.update('master', user, {
        id: '1',
        type: 'articles',
        attributes: {
          title: 'Conflicting title'
        },
        meta: {
          version: headId
        }
      });
      throw new Error("should not get here");
    } catch (err) {
      if (!err.status) {
        throw err;
      }
      expect(err.status).to.equal(409);
      expect(err.detail).to.match(/merge conflict/i);
    }
  });

});
