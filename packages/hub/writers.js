const Error = require('@cardstack/plugin-utils/error');
const logger = require('@cardstack/plugin-utils/logger');
const EventEmitter = require('events');
const { declareInjections } = require('@cardstack/di');

module.exports = declareInjections({
  schemaCache: 'hub:schema-cache',
  schemaLoader: 'hub:schema-loader'
},

class Writers extends EventEmitter {
  constructor() {
    super();
    this.log = logger('writers');
  }

  get schemaTypes() {
    return this.schemaLoader.ownTypes();
  }

  async create(branch, session, type, document) {
    this.log.info("creating type=%s", type);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let token = this.schemaCache.prepareBranchUpdate(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = this.schemaTypes.includes(type);
    let pending = await writer.prepareCreate(branch, session, type, document, isSchema);
    try {
      let newSchema = await schema.validate(pending, { type, session });
      let response = await this._finalizeAndReply(pending);
      if (newSchema) {
        this.schemaCache.notifyBranchUpdate(branch, newSchema, token);
      }
      this.emit('changed', { branch, type, id: response.id });
      return response;
    } finally {
      // this does nothing if the change was properly finalized
      // already, and cleans up if it wasn't.
      await pending.abort();
    }
  }

  async update(branch, session, type, id, document) {
    this.log.info("updating type=%s id=%s", type, id);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let token = this.schemaCache.prepareBranchUpdate(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = this.schemaTypes.includes(type);
    let pending = await writer.prepareUpdate(branch, session, type, id, document, isSchema);
    try {
      let newSchema = await schema.validate(pending, { type, id, session });
      let response = await this._finalizeAndReply(pending);
      if (newSchema) {
        this.schemaCache.notifyBranchUpdate(branch, newSchema, token);
      }
      this.emit('changed', { branch, type, id });
      return response;
    } finally {
      await pending.abort();
    }
  }

  async delete(branch, session, version, type, id) {
    this.log.info("deleting type=%s id=%s", type, id);
    let schema = await this.schemaCache.schemaForBranch(branch);
    let token = this.schemaCache.prepareBranchUpdate(branch);
    let writer = this._lookupWriter(schema, type);
    let isSchema = this.schemaTypes.includes(type);
    let pending = await writer.prepareDelete(branch, session, version, type, id, isSchema);
    try {
      let newSchema = await schema.validate(pending, { session });
      await pending.finalize();
      if (newSchema) {
        this.schemaCache.notifyBranchUpdate(branch, newSchema, token);
      }
      this.emit('changed', { branch, type, id });
    } finally {
      await pending.abort();
    }
  }

  async _finalizeAndReply(pending) {
    let meta = await pending.finalize();
    let finalDocument = pending.finalDocument;
    let responseDocument = {
      id: finalDocument.id,
      type: finalDocument.type,
      meta
    };
    if (finalDocument.attributes) {
      responseDocument.attributes = finalDocument.attributes;
    }
    if (finalDocument.relationships) {
      responseDocument.relationships = finalDocument.relationships;
    }
    return responseDocument;
  }

  _lookupWriter(schema, type) {
    let contentType = schema.types.get(type);
    let writer;
    if (!contentType || !contentType.dataSource || !(writer = contentType.dataSource.writer)) {
      this.log.debug('non-writeable type %s: exists=%s hasDataSource=%s hasWriter=%s', type, !!contentType, !!(contentType && contentType.dataSource), !!writer);

      throw new Error(`"${type}" is not a writable type`, {
        status: 403,
        title: "Not a writable type"
      });
    }
    return writer;
  }
});
