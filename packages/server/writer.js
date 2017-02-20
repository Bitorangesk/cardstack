const {
  Repository
} = require('nodegit');

const logger = require('heimdalljs-logger');
const crypto = require('crypto');
const git = require('./git');
const os = require('os');
const process = require('process');

module.exports = class Writer {
  constructor({ repoPath, idGenerator }) {
    this.repoPath = repoPath;
    this.repo = null;
    this.log = logger('writer');
    let hostname = os.hostname();
    this.myName = `PID${process.pid} on ${hostname}`;
    this.myEmail = `${os.userInfo().username}@${hostname}`;
    this.idGenerator = idGenerator;
  }

  async create(branch, user, document) {
    while (true) {
      try {
        // 20 bytes is good enough for git, so it's good enough for
        // me. In practice we probably have a lower collision
        // probability too, because we're allowed to retry if we know
        // the id is already in use (so we can really only collide
        // with things that have not yet merged into our branch).
        let id = this._generateId();
        let doc = await this._create(branch, user, document, id);
        return doc;
      } catch(err) {
        if (!(err instanceof git.OverwriteRejected)) {
          throw err;
        }
      }
    }
  }

  async _create(branch, user, document, id) {
    let commitOpts = {
      authorName: user.fullName,
      authorEmail: user.email,
      committerName: this.myName,
      committerEmail: this.myEmail,
      message: `create ${document.type} ${id.slice(12)}`
    };
    await this._ensureRepo();
    let commitId = await git.mergeCommit(this.repo, null, branch, [
      {
        operation: 'create',
        filename: `contents/${document.type}/${id}.json`,
        buffer: Buffer.from(JSON.stringify(document.attributes), 'utf8')
      }
    ], commitOpts);

    return {
      id,
      type: document.type,
      attributes: document.attributes,
      meta: {
        version: commitId
      }
    };
  }

  async _ensureRepo() {
    if (!this.repo) {
      this.repo = await Repository.open(this.repoPath);
    }
  }

  _generateId() {
    if (this.idGenerator) {
      return this.idGenerator();
    } else {
      return crypto.randomBytes(20).toString('hex');
    }
  }

};
