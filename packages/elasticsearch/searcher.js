const makeClient = require('@cardstack/elasticsearch/client');
const logger = require('heimdalljs-logger');
const Error = require('@cardstack/plugin-utils/error');

class Searcher {
  static branchToIndexName(branch) {
    return `content_${branch}`;
  }

  constructor(schemaCache) {
    this.es = makeClient();
    this.log = logger('searcher');
    this.schemaCache = schemaCache;
  }

  async get(branch, type, id) {
    let document = await this.es.getSource({
      index: this.constructor.branchToIndexName(branch),
      type,
      id
    });
    return this._searchDocToJSONAPI(type, id, document);
  }

  async search(branch, { queryString, filter, sort, page }) {
    let schema = await this.schemaCache.schemaForBranch(branch);
    let esBody = {
      query: {
        bool: {
          must: [],
          // All searches exclude `meta` documents, because those are
          // internal to our system.
          must_not: [{
            term: {
              _type: 'meta'
            }
          }]
        }
      },
      sort: this._buildSorts(schema, sort)
    };

    let size = 10;
    if (page && /^\d+$/.test(page.size)) {
      size = parseInt(page.size, 10);
    }

    // We always overfetch by one record. This allows us to know
    // whether we should offer a next page link.
    esBody.size = size + 1;

    if (page && page.cursor) {
      esBody.search_after = JSON.parse(decodeURIComponent(page.cursor));
    }

    if (queryString) {
      esBody.query.bool.must.push({
        match: {
          _all: queryString
        }
      });
    }
    if (filter) {
      for (let expression of this._filterToES(schema, filter)) {
        esBody.query.bool.must.push(expression);
      }
    }
    this.log.debug('search %j', esBody);
    try {
      let result = await this.es.search({
        index: this.constructor.branchToIndexName(branch),
        body: esBody
      });
      this.log.debug('searchResult %j', result);
      return this._assembleResponse(result, size);
    } catch (err) {
      // elasticsearch errors have their own status codes, and Koa
      // will treat them as valid responses if we let them through. We
      // don't want that -- we want to render proper JSONAPI errors.
      if (err.message && err.body && err.body.error) {
        if (err.message.indexOf('[index_not_found_exception]') === 0) {
          throw new Error(`No such branch '${branch}' in our search index`, {
            status: 404,
            title: "No such branch"
          });
        }
        throw new Error(err.message, {
          status: 500,
          title: 'elasticsearch failure',
        });
      }
      throw err;
    }
  }

  _assembleResponse(result, requestedSize) {
    let documents = result.hits.hits;
    let pagination = {
      total: result.hits.total
    };

    if (documents.length > requestedSize) {
      documents = documents.slice(0, requestedSize);
      let last = documents[documents.length - 1];
      pagination.cursor = encodeURIComponent(JSON.stringify(last.sort));
    }

    let models = documents.map(
      document => this._searchDocToJSONAPI(document._type, document._id, document._source)
    );
    return {
      models,
      page: pagination
    };
  }

  _searchDocToJSONAPI(type, id, document) {
    let relnames = document.cardstack_rel_names;
    let derivedNames = document.cardstack_derived_names;
    let attributes;
    let relationships;
    Object.keys(document).forEach(fieldName => {
      if (fieldName === 'cardstack_rel_names' || fieldName === 'cardstack_meta' || fieldName === 'cardstack_derived_names') {
        // pass
      } else if (relnames.includes(fieldName)) {
        if (!relationships) {
          relationships = {};
        }
        relationships[fieldName] = document[fieldName];
      } else if (derivedNames.includes(fieldName)) {
        // pass
      } else {
        if (!attributes) {
          attributes = {};
        }
        attributes[fieldName] = document[fieldName];
      }
    });
    return {
      type,
      id,
      attributes,
      relationships,
      meta: document.cardstack_meta
    };
  }

  _filterToES(schema, filter) {
    let result = [];
    Object.keys(filter).forEach(key => {
      let value = filter[key];
      switch(key) {
      case 'not':
        result.push({ bool: { must_not: this._filterToES(schema, value) } });
        break;
      case 'or':
        if (!Array.isArray(value)) {
          throw new Error(`the "or" operator must receive an array of other filters`, { status: 400 });
        }
        result.push({ bool: { should: value.map(v => ({ bool: { must: this._filterToES(schema, v) } })) } });
        break;
      case 'and':
        // 'and' is not strictly needed, since we already conjoin all
        // top-level conditions. But for completeness, it works.
        if (!Array.isArray(value)) {
          throw new Error(`the "and" operator must receive an array of other filters`, { status: 400 });
        }
        value.forEach(v => {
          this._filterToES(schema, v).forEach(r => {
            result.push(r);
          });
        });
        break;
      default:
        // Any keys that aren't one of the predefined operations are
        // field names.
        result.push(this._fieldFilter(schema, key, value));
      }
    });
    return result;
  }

  _fieldFilter(schema, key, value) {
    let field = fieldNameFromKey(schema, key);

    if (typeof value === 'string') {
      // Bare strings are shorthand for a single term filter
      return { term: { [field] : value.toLowerCase() } };
    }

    if (Array.isArray(value)) {
      // Bare arrays are shorthand for a multi term filter
      return { terms: { [field] : value.map(elt => elt.toLowerCase()) } };
    }

    if (value.range) {
      let limits = {};
      ['lte', 'gte', 'lt', 'gt'].forEach(limit => {
        if (value.range[limit]) {
          limits[limit] = value.range[limit];
        }
      });
      return {
        range: {
          [field]: limits
        }
      };
    }

    if (value.exists != null) {
      if (String(value.exists) === 'false') {
        return {
          bool: { must_not: { exists: { field } } }
        };
      } else {
        return {
          exists: { field }
        };
      }
    }

    throw new Error(`Unimplemented filter ${key} ${value}`);
  }

  _buildSorts(schema, sort) {
    let output = [];
    if (sort) {
      if (Array.isArray(sort)) {
        sort.forEach(name => {
          output.push(this._buildSort(schema, name));
        });
      } else {
        output.push(this._buildSort(schema, sort));
      }
    }

    // We always have a backstop sort so we guarantee a total
    // order. This ensures pagination is correct.
    output.push({ '_uid': 'asc' });
    return output;
  }

  _buildSort(schema, name) {
    let realName, order;
    if (name.indexOf('-') === 0) {
      realName = name.slice(1);
      order = 'desc';
    } else {
      realName = name;
      order = 'asc';
    }
    let field = schema.fields.get(realName);
    if (!field) {
      throw new Error(`Cannot sort by unknown field "${realName}"`, {
        status: 400,
        title: "Unknown sort field"
      });
    }
    return {
      [field.sortFieldName] : { order }
    };
  }

}

// We use elastic search's built-in _type and _id to store JSONAPI's
// type and id. We don't want clients to need to add the underscores.
function fieldNameFromKey(schema, key) {
  if (key === 'type') {
    return '_type';
  }
  if (key === 'id') {
    return '_id';
  }
  let field = schema.fields.get(key);
  if (!field) {
    throw new Error(`Cannot filter by unknown field "${key}"`, {
      status: 400,
      title: "Unknown field in filter"
    });
  }
  return field.queryFieldName;
}

module.exports = Searcher;
