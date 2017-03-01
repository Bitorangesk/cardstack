const Error = require('@cardstack/data-source/error');
const Field = require('@cardstack/server/field');
const ContentType = require('@cardstack/server/content-type');

module.exports = class Schema {
  static async loadFrom(searcher, branch) {
    let models = await searcher.search(branch, {
      type: ['content-types', 'fields']
    });

    let fields = new Map();
    for (let model of models) {
      if (model.type === 'fields') {
        fields.set(model.id, new Field(model));
      }
    }

    let types = new Map();
    for (let model of models) {
      if (model.type === 'content-types') {
        types.set(model.id, new ContentType(model, fields));
      }
    }

    return new this(types);
  }

  constructor(types) {
    this.types = types;
  }

  async validationErrors(document) {
    let errors = [];

    let type = this.types.get(document.type);
    if (!type) {
      errors.push(new Error(`"${document.type}" is not a valid type`, {
        status: 400,
        source: { pointer: '/data/type' }
      }));
      return errors;
    }

    errors = errors.concat(await type.validationErrors(document));

    return errors;
  }
};
